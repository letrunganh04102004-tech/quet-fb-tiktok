import React, { useState, useCallback, useRef, useMemo } from 'react';
import type { SocialVideo, TranscriptState, TranscriptCache, AppStep } from './types';
import useLocalStorage from './hooks/useLocalStorage';
import { transcribeAudioWithGemini } from './services/geminiService';
import { fetchTikTokData, fetchFacebookData } from './services/apifyService';
import { downloadCsv, downloadVideoUrlsCsv } from './utils/csvHelper';
import { ScanIcon, DownloadIcon, EyeIcon, EyeOffIcon, StopIcon, TranscribeIcon, FolderUploadIcon, RetryIcon } from './components/icons';

// Helper to fetch media from a URL and convert it to Base64
const getBase64FromUrl = async (url: string): Promise<{ base64: string; mimeType: string }> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Network response was not ok, status: ${response.status}`);
    
    const blob = await response.blob();
    const mimeType = blob.type;
    // We now expect audio files from the user-provided links
    if (!mimeType.startsWith('audio/')) console.warn(`Fetched file might not be an audio file. Type: ${mimeType}`);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        if (base64) resolve({ base64, mimeType });
        else reject(new Error("Could not convert file to base64."));
      };
      reader.onerror = (error) => reject(error);
    });
  } catch (error) {
    console.error("Error fetching or converting media:", error);
    throw new Error("Không thể tải tệp âm thanh. Đây có thể là sự cố CORS hoặc URL không hợp lệ.");
  }
};

const App: React.FC = () => {
  // --- State Management ---
  const [step, setStep] = useState<AppStep>('scan');

  const [googleApiKey, setGoogleApiKey] = useLocalStorage<string>('googleApiKey', '');
  const [apifyToken, setApifyToken] = useLocalStorage<string>('apifyToken', '');
  const [channelUrl, setChannelUrl] = useState<string>('');
  const [resultsLimit, setResultsLimit] = useState<number>(20);
  
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [status, setStatus] = useState<string>('Sẵn sàng.');
  
  const [videos, setVideos] = useState<SocialVideo[]>([]);
  const [mp3Links, setMp3Links] = useLocalStorage<{[videoUrl: string]: string}>('mp3Links', {});
  
  const [transcriptStates, setTranscriptStates] = useState<TranscriptState>({});
  const [transcriptCache, setTranscriptCache] = useLocalStorage<TranscriptCache>('transcriptCache', {});
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  const [isGoogleKeyVisible, setIsGoogleKeyVisible] = useState(false);
  const [isApifyKeyVisible, setIsApifyKeyVisible] = useState(false);

  const stopRequest = useRef(false);

  // --- Handlers ---
  const handleScan = useCallback(async () => {
    setIsProcessing(true);
    setStatus('Bước 1: Đang quét kênh...');
    setVideos([]);
    
    try {
        let fetchedVideos: SocialVideo[] = [];
        const trimmedUrl = channelUrl.trim().toLowerCase();

        if (trimmedUrl.includes('tiktok.com')) {
            setStatus('Bước 1: Đang quét kênh TikTok với Apify...');
            fetchedVideos = await fetchTikTokData(apifyToken, channelUrl, resultsLimit);
        } else if (trimmedUrl.includes('facebook.com') || trimmedUrl.includes('fb.com')) {
            setStatus('Bước 1: Đang quét kênh Facebook với Apify...');
            fetchedVideos = await fetchFacebookData(apifyToken, channelUrl, resultsLimit);
        } else {
            throw new Error('URL không được hỗ trợ. Vui lòng nhập URL của kênh TikTok hoặc Facebook.');
        }

        setVideos(fetchedVideos);
        setStatus(`Quét thành công! Tìm thấy ${fetchedVideos.length} video. Chuyển sang bước ghép nối âm thanh.`);
        setStep('match');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setStatus(`Lỗi quét: ${errorMessage}`);
    } finally {
        setIsProcessing(false);
    }
  }, [apifyToken, channelUrl, resultsLimit]);

  const handleTranscribe = useCallback(async () => {
    stopRequest.current = false;
    setIsProcessing(true);
    setStep('results');
    setStatus('Bắt đầu phiên âm. Có độ trễ giữa các yêu cầu để tuân thủ giới hạn API của Google.');

    const videosToProcess = videos.filter(v => mp3Links[v.webVideoUrl] && !transcriptCache[v.webVideoUrl]);

    if (videosToProcess.length === 0) {
        setStatus('Hoàn tất. Không có video mới nào được cung cấp link MP3 để phiên âm.');
        setIsProcessing(false);
        return;
    }

    let successCount = 0;
    const API_CALL_DELAY_MS = 6000; // Delay to respect Gemini API rate limits (10 RPM)

    for (let i = 0; i < videosToProcess.length; i++) {
        if (stopRequest.current) {
            setStatus(`Quá trình đã được người dùng dừng lại. ${successCount} bản ghi mới đã được tạo.`);
            break;
        }

        const video = videosToProcess[i];
        const url = video.webVideoUrl;
        const mp3Url = mp3Links[url];
        
        setStatus(`Đang xử lý ${i + 1}/${videosToProcess.length}: ${video.authorMeta.nickName}`);
        setTranscriptStates(prev => ({ ...prev, [url]: { status: 'loading', text: 'Đang tải MP3...' }}));

        try {
            const { base64, mimeType } = await getBase64FromUrl(mp3Url);
            setTranscriptStates(prev => ({ ...prev, [url]: { status: 'loading', text: 'Đang phiên âm với AI...' }}));

            const transcript = await transcribeAudioWithGemini(googleApiKey, base64, mimeType);
            
            setTranscriptStates(prev => ({ ...prev, [url]: { status: 'success', text: transcript }}));
            setTranscriptCache(prev => ({ ...prev, [url]: transcript }));
            successCount++;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setTranscriptStates(prev => ({ ...prev, [url]: { status: 'error', text: `Lỗi: ${errorMessage}` }}));
        }

        if (i < videosToProcess.length - 1 && !stopRequest.current) {
            await new Promise(resolve => setTimeout(resolve, API_CALL_DELAY_MS));
        }
    }
    if (!stopRequest.current) {
        setStatus(`Hoàn tất! Đã tạo mới ${successCount} bản ghi.`);
    }
    setIsProcessing(false);
  }, [googleApiKey, videos, mp3Links, transcriptCache, setTranscriptCache]);

  const handleRetry = useCallback(async (videoToRetry: SocialVideo) => {
    const url = videoToRetry.webVideoUrl;
    const mp3Url = mp3Links[url];

    if (!mp3Url) {
      setTranscriptStates(prev => ({ ...prev, [url]: { status: 'error', text: 'Lỗi: Không tìm thấy link MP3.' }}));
      return;
    }

    setRetryingIds(prev => new Set(prev).add(videoToRetry.id));
    setTranscriptStates(prev => ({ ...prev, [url]: { status: 'loading', text: 'Đang tải MP3...' }}));

    try {
      const { base64, mimeType } = await getBase64FromUrl(mp3Url);
      setTranscriptStates(prev => ({ ...prev, [url]: { status: 'loading', text: 'Đang phiên âm với AI...' }}));

      const transcript = await transcribeAudioWithGemini(googleApiKey, base64, mimeType);
      
      setTranscriptStates(prev => ({ ...prev, [url]: { status: 'success', text: transcript }}));
      setTranscriptCache(prev => ({ ...prev, [url]: transcript }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setTranscriptStates(prev => ({ ...prev, [url]: { status: 'error', text: `Lỗi: ${errorMessage}` }}));
    } finally {
      setRetryingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(videoToRetry.id);
        return newSet;
      });
    }
  }, [googleApiKey, mp3Links, setTranscriptCache]);


  const handleStopProcessing = () => {
    stopRequest.current = true;
    setStatus('Đang yêu cầu dừng...');
  };
  
  const handleClearSession = () => {
    setVideos([]);
    setTranscriptStates({});
    setMp3Links({});
    setChannelUrl('');
    setStatus('Sẵn sàng.');
    setStep('scan');
  };

  const handleMp3LinkChange = (videoUrl: string, mp3Link: string) => {
    setMp3Links(prev => ({ ...prev, [videoUrl]: mp3Link }));
  };

  const completedCount = useMemo(() => videos.filter(v => transcriptCache[v.webVideoUrl]).length, [videos, transcriptCache]);
  const matchedCount = useMemo(() => videos.filter(v => mp3Links[v.webVideoUrl]).length, [videos, mp3Links]);

  const renderStepContent = () => {
    switch(step) {
      case 'scan': return null; // Scan is the default view with config
      case 'match': return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Bước 2: Ghép nối Âm thanh</h2>
                <button 
                    onClick={() => downloadVideoUrlsCsv(videos)} 
                    disabled={videos.length === 0}
                    className="flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    <DownloadIcon /> Tải URL Video
                </button>
            </div>
            <p className="mb-4 text-gray-600 dark:text-gray-400">Dán URL tải xuống MP3 trực tiếp cho mỗi video. Chỉ những video có URL âm thanh hợp lệ mới được xử lý.</p>
            <div className="overflow-x-auto max-h-[60vh]">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                        <tr>
                            <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Thông tin Video</th>
                            <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">URL Tệp Âm thanh (MP3)</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {videos.map(video => (
                            <tr key={video.id}>
                                <td className="px-3 py-4 max-w-xs">
                                    <p className="font-semibold text-gray-900 dark:text-white truncate" title={video.text}>{video.text || 'Không có mô tả'}</p>
                                    <a href={video.webVideoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline truncate" title={video.webVideoUrl}>bởi {video.authorMeta?.nickName || 'Không rõ'}</a>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate" title={video.webVideoUrl}>{video.webVideoUrl}</p>
                                </td>
                                <td className="px-3 py-4">
                                    <input 
                                        type="url" 
                                        value={mp3Links[video.webVideoUrl] || ''}
                                        onChange={(e) => handleMp3LinkChange(video.webVideoUrl, e.target.value)}
                                        placeholder="https://.../audio.mp3" 
                                        className="block w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-xs" />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      );
      case 'results': return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Bước 3: Kết quả Phiên âm</h2>
              {!isProcessing && (
                  <button
                      onClick={() => setStep('match')}
                      className="flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
                  >
                      <FolderUploadIcon /> Quay lại Ghép nối
                  </button>
              )}
            </div>
            <div id="resultsTable" className="overflow-x-auto max-h-[60vh]">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                        <tr>
                            <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Thông tin Video</th>
                            <th className="px-3 py-3 text-left font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Nội dung Phiên âm</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700 align-top">
                        {videos.map(video => {
                            const url = video.webVideoUrl;
                            const finalTranscript = transcriptCache[url];
                            const state = transcriptStates[url];
                            const isRetrying = retryingIds.has(video.id);

                            let transcriptContent;
                            if (finalTranscript !== undefined) {
                                transcriptContent = <p className="text-gray-600 dark:text-gray-300 max-h-24 overflow-y-auto p-1 bg-gray-100 dark:bg-gray-700 rounded">{finalTranscript}</p>;
                            } else if (state?.status === 'loading') {
                                transcriptContent = <span className="italic text-gray-500">{state.text}</span>;
                            } else if (state?.status === 'error') {
                                transcriptContent = (
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-red-500 text-xs flex-grow">{state.text}</span>
                                        <button
                                            onClick={() => handleRetry(video)}
                                            disabled={isProcessing || isRetrying}
                                            className="flex items-center px-2 py-1 border border-gray-300 dark:border-gray-600 text-xs font-medium rounded-md shadow-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Thử lại phiên âm cho video này"
                                        >
                                            {isRetrying ? 'Đang thử...' : <><RetryIcon /> Thử lại</>}
                                        </button>
                                    </div>
                                );
                            } else if (mp3Links[url]) {
                                transcriptContent = <span className="italic text-gray-400">Đang chờ phiên âm...</span>;
                            } else {
                                transcriptContent = <span className="italic text-gray-500">Chưa cung cấp link MP3.</span>;
                            }
                            
                            return (
                                <tr key={video.id}>
                                    <td className="px-3 py-4 max-w-xs">
                                        <p className="font-semibold text-gray-900 dark:text-white truncate" title={video.text}>{video.text || 'Không có mô tả'}</p>
                                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline truncate" title={url}>bởi {video.authorMeta?.nickName || 'Không rõ'}</a>
                                    </td>
                                    <td className="px-3 py-4 min-w-[250px]">{transcriptContent}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans text-gray-800 dark:text-gray-200 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-teal-400">
            Social Video AI Transcriber
          </h1>
          <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">Công cụ tự động quét và phiên âm video từ TikTok & Facebook theo 3 bước.</p>
        </header>

        {/* --- CONFIGURATION --- */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 space-y-6 mb-8">
            <div className="flex justify-center items-center p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
                <div className={`flex flex-col items-center px-4 ${step === 'scan' ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${step === 'scan' ? 'border-blue-600 bg-blue-100 dark:bg-blue-900' : 'border-gray-400'}`}><ScanIcon /></div>
                    <p className="text-xs mt-1">1. Quét</p>
                </div>
                <div className="flex-grow h-px bg-gray-300 dark:bg-gray-600"></div>
                <div className={`flex flex-col items-center px-4 ${step === 'match' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500'}`}>
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${step === 'match' ? 'border-blue-600 bg-blue-100 dark:bg-blue-900' : 'border-gray-400'}`}><FolderUploadIcon /></div>
                    <p className="text-xs mt-1">2. Ghép nối</p>
                </div>
                <div className="flex-grow h-px bg-gray-300 dark:bg-gray-600"></div>
                <div className={`flex flex-col items-center px-4 ${step === 'results' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500'}`}>
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${step === 'results' ? 'border-blue-600 bg-blue-100 dark:bg-blue-900' : 'border-gray-400'}`}><TranscribeIcon /></div>
                    <p className="text-xs mt-1">3. Kết quả</p>
                </div>
            </div>

            <div style={{display: step === 'scan' || step === 'match' ? 'block' : 'none' }}>
                <label htmlFor="googleApiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Google AI API Key</label>
                <div className="relative mt-1">
                    <input type={isGoogleKeyVisible ? 'text' : 'password'} id="googleApiKey" value={googleApiKey} onChange={e => setGoogleApiKey(e.target.value)} className="block w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 pr-10" disabled={step !== 'scan'} />
                    <button onClick={() => setIsGoogleKeyVisible(!isGoogleKeyVisible)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Toggle Google AI key visibility">
                        {isGoogleKeyVisible ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                </div>
            </div>
            <div style={{display: step === 'scan' || step === 'match' ? 'block' : 'none' }}>
                <label htmlFor="apifyToken" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Apify API Token</label>
                <div className="relative mt-1">
                    <input type={isApifyKeyVisible ? 'text' : 'password'} id="apifyToken" value={apifyToken} onChange={e => setApifyToken(e.target.value)} className="block w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 pr-10" disabled={step !== 'scan'} />
                    <button onClick={() => setIsApifyKeyVisible(!isApifyKeyVisible)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Toggle Apify key visibility">
                        {isApifyKeyVisible ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6" style={{display: step === 'scan' ? 'grid' : 'none'}}>
                <div className="md:col-span-3">
                    <label htmlFor="channelUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300">URL Kênh (TikTok hoặc Facebook)</label>
                    <input type="text" id="channelUrl" value={channelUrl} onChange={e => setChannelUrl(e.target.value)} placeholder="e.g., https://www.tiktok.com/@username hoặc https://www.facebook.com/profilename" className="mt-1 block w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div className="md:col-span-2">
                    <label htmlFor="resultsLimit" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Số video tối đa</label>
                    <input type="number" id="resultsLimit" value={resultsLimit} onChange={e => setResultsLimit(parseInt(e.target.value, 10))} min="1" max="200" className="mt-1 block w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div id="status" className="text-sm text-gray-600 dark:text-gray-400 flex-grow">{status}</div>
                <div className="flex items-center gap-4">
                     {step === 'scan' && (
                        <button onClick={handleScan} disabled={!googleApiKey || !apifyToken || !channelUrl || isProcessing} className="w-full sm:w-auto flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
                            <ScanIcon /> Quét Kênh
                        </button>
                     )}
                     {step === 'match' && (
                        <button onClick={handleTranscribe} disabled={matchedCount === 0 || isProcessing} className="w-full sm:w-auto flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
                            <TranscribeIcon /> Bắt đầu Phiên âm ({matchedCount})
                        </button>
                     )}
                     {step === 'results' && isProcessing && (
                         <button onClick={handleStopProcessing} className="flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
                            <StopIcon /> Dừng
                        </button>
                     )}
                     {(step === 'results' || (step === 'match' && videos.length > 0)) && (
                        <button onClick={() => downloadCsv(videos, transcriptCache)} disabled={completedCount === 0 || isProcessing} className="flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
                            <DownloadIcon /> Tải CSV ({completedCount})
                        </button>
                     )}
                     <button 
                        onClick={handleClearSession} 
                        disabled={isProcessing} 
                        title="Bắt đầu quét mới và giữ lại API keys đã nhập"
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md shadow-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        Làm mới
                      </button>
                </div>
            </div>
        </div>

        {/* --- DYNAMIC STEP CONTENT --- */}
        {renderStepContent()}

      </div>
    </div>
  );
};

export default App;