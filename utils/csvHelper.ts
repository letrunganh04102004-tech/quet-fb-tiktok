import { SocialVideo, TranscriptCache } from '../types';

// Helper function to safely format CSV fields, handling quotes and commas.
const sanitizeCsvField = (field: any): string => {
  if (field === null || field === undefined) {
    return '""';
  }
  const stringField = String(field);
  // If the field contains a comma, a quote, or a newline, wrap it in double quotes.
  if (/[",\n]/.test(stringField)) {
    // Also, double up any existing double quotes inside the field.
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
};


export const downloadCsv = (videos: SocialVideo[], transcripts: TranscriptCache) => {
  if (videos.length === 0) {
    alert("No data to download.");
    return;
  }

  // Comprehensive headers including all new fields
  const headers = [
    'ID', 'URL', 'Timestamp ISO', 'Author Name', 'Author Nickname', 'Author Avatar', 'Description',
    'Likes', 'Comments', 'Shares', 'Plays', 'Duration (s)',
    'Video Height', 'Video Width', 'Music Name', 'Music Author', 'Original Music', 'Transcript'
  ];

  const rows = videos.map(video => {
    const transcript = transcripts[video.webVideoUrl] || 'N/A';
    return [
      sanitizeCsvField(video.id),
      sanitizeCsvField(video.webVideoUrl),
      sanitizeCsvField(video.createTimeISO),
      sanitizeCsvField(video.authorMeta.name),
      sanitizeCsvField(video.authorMeta.nickName),
      sanitizeCsvField(video.authorMeta.avatar),
      sanitizeCsvField(video.text), // Use video.text for description
      video.diggCount,
      video.commentCount,
      video.shareCount,
      video.playCount,
      video.videoMeta.duration,
      video.videoMeta.height,
      video.videoMeta.width,
      sanitizeCsvField(video.musicMeta.musicName),
      sanitizeCsvField(video.musicMeta.musicAuthor),
      video.musicMeta.musicOriginal,
      sanitizeCsvField(transcript),
    ].join(',');
  });

  // Add BOM for UTF-8 Excel compatibility and join all parts.
  const csvString = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');

  // Create a Blob from the CSV string. This is more robust than data URIs.
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });

  // Create a link to download the Blob
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", "tiktok_transcripts_full.csv");
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const downloadVideoUrlsCsv = (videos: SocialVideo[]) => {
  if (videos.length === 0) {
    alert("Không có video nào để tải xuống URL.");
    return;
  }

  const headers = ['Mô tả', 'URL Video'];

  const rows = videos.map(video => {
    return [
      sanitizeCsvField(video.text),
      sanitizeCsvField(video.webVideoUrl),
    ].join(',');
  });

  const csvString = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", "tiktok_video_urls.csv");
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};