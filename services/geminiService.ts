import { GoogleGenAI } from "@google/genai";

/**
 * Transcribes an audio track from a media file using the Google Gemini API.
 * @param googleApiKey The Google AI API key provided by the user.
 * @param base64Media The base64-encoded media data (video or audio).
 * @param mimeType The MIME type of the media data (e.g., 'audio/mpeg').
 * @returns A promise that resolves to the transcript string.
 */
export const transcribeAudioWithGemini = async (
  googleApiKey: string,
  base64Media: string,
  mimeType: string
): Promise<string> => {
  if (!googleApiKey) {
    throw new Error("Google AI API Key is required.");
  }
  // Initialize the AI client with the user-provided key.
  const ai = new GoogleGenAI({ apiKey: googleApiKey });

  try {
    // Construct the generative part directly from the provided base64 data.
    const mediaPart = {
      inlineData: {
        mimeType,
        data: base64Media,
      },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { text: "Hãy phiên âm chính xác nội dung từ file âm thanh này sang văn bản tiếng Việt. Chỉ trả về nội dung lời thoại, không thêm bất kỳ lời dẫn hay ghi chú nào." },
          mediaPart
        ]
      },
    });

    const transcript = response.text;
    if (!transcript) {
      throw new Error("Gemini không trả về lời thoại.");
    }

    return transcript;

  } catch (error) {
    console.error("Lỗi trong quá trình lấy lời thoại:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Lỗi không xác định khi gọi Gemini.";

    // Improved Error Handling: Check for rate limit / quota exceeded errors.
    if (errorMessage.includes('429') || /rate limit|quota/i.test(errorMessage)) {
      throw new Error('Đã đạt giới hạn quota của Google AI (thường là 15 yêu cầu/phút). Vui lòng đợi một lát rồi thử lại.');
    }
    
    if (/API_KEY_INVALID/i.test(errorMessage) || errorMessage.includes('400')) {
        throw new Error('Google AI API Key được cung cấp không hợp lệ. Vui lòng kiểm tra lại key của bạn.');
    }

    // Re-throw a user-friendly error message for other cases
    throw new Error(errorMessage);
  }
};
