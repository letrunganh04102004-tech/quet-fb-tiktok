# Social Video AI Transcriber

An automated tool to scan TikTok and Facebook channels, fetch video lists, and generate Vietnamese transcripts in bulk using Google's Gemini AI.

This application provides a simple 3-step user interface to streamline the process of collecting and transcribing content from TikTok and Facebook for analysis, content creation, or archiving.

## Features

-   **Guided 3-Step Process:** A simple workflow takes you from scanning a channel to downloading final transcripts.
-   **Social Media Channel Scanning:** Integrates with Apify actors to fetch the latest videos from any public TikTok or Facebook channel.
-   **AI-Powered Transcription:** Leverages the power of Google's `gemini-2.5-flash` model for fast and accurate audio-to-text transcription in Vietnamese.
-   **Bulk Processing:** Queue up multiple videos and transcribe them in a single session.
-   **Session Persistence:** API keys, audio links, and completed transcripts are saved in your browser's local storage, so you can close the tab and resume your work later.
-   **Error Handling & Retries:** Includes built-in delays to respect API rate limits and allows you to retry individual failed transcriptions with a single click.
-   **Data Export:** Download all video metadata (URL, description, stats) and their corresponding transcripts into a single, comprehensive CSV file, ready for use in Excel or Google Sheets.
-   **Modern UI:** A clean, responsive interface with dark mode support for a comfortable user experience.

## How It Works

The application breaks down the complex task of bulk transcription into three manageable steps:

1.  **Step 1: Scan Channel:** You provide your API keys, a channel URL (TikTok or Facebook), and the number of videos to fetch. The app uses the Apify API to get the video list.
2.  **Step 2: Match Audio:** The app displays the list of found videos. For each video, you must provide a direct download link (.mp3, .wav, etc.) to its audio file. This step is necessary because downloading audio directly from these platforms is not feasible from a web browser.
3.  **Step 3: Transcribe & View Results:** The app downloads each audio file from the link you provided, converts it to a format the AI can process, and sends it to the Gemini API for transcription. Results are displayed in real-time and can be downloaded.

## Requirements

To use this application, you will need two API keys from third-party services:

-   **Apify API Token:** You need an account with [Apify](https://apify.com/) and your personal API token to use the scraping functionality.
-   **Google AI API Key:** You need a Google AI API key for Gemini to perform the audio transcriptions. You can get one for free from [Google AI Studio](https://aistudio.google.com/app/apikey).

## Usage Guide

#### Step 1: Configuration & Scanning

1.  Open the application.
2.  Enter your **Google AI API Key** and **Apify API Token** into the designated fields. These keys are saved locally in your browser for future sessions.
3.  Enter the full **URL of the Channel** you wish to scan (e.g., `https://www.tiktok.com/@username` or `https://www.facebook.com/profilename`).
4.  Set the **maximum number of recent videos** you want to retrieve.
5.  Click **"Quét Kênh" (Scan Channel)** to begin. The status bar will show the progress.

#### Step 2: Matching Audio Files

1.  After a successful scan, the interface will automatically advance to the "Ghép nối" (Match) step.
2.  You will see a table of all the videos found. For each video, there is an input field titled "URL Tệp Âm thanh (MP3)".
3.  In this field, paste the corresponding **direct audio file URL** (e.g., a link ending in `.mp3`).
    -   *Tip:* You can use the **"Tải URL Video" (Download Video URLs)** button to get a CSV list of the video links. You can then use a third-party service or tool to download the audio from these links and host them to get a direct URL.
4.  Once you have added links for all the videos you wish to process, click the **"Bắt đầu Phiên âm" (Start Transcription)** button. The number on the button indicates how many videos are ready for transcription.

#### Step 3: Getting Results

1.  The app will now move to the "Kết quả" (Results) tab and begin processing each video one by one.
2.  You can monitor the progress in real-time. Each video's status will change from "Đang chờ" (Waiting) to "Đang tải" (Downloading), "Đang phiên âm" (Transcribing), and finally, the completed transcript will appear.
3.  If a transcription fails, an error message will be shown with a **"Thử lại" (Retry)** button, allowing you to re-process just that video.
4.  You can stop the entire process at any time by clicking the **"Dừng" (Stop)** button.
5.  Once finished, or at any point where you have completed transcripts, click **"Tải CSV" (Download CSV)** to export all the data.
6.  To start a new scan, click **"Làm mới" (Refresh)**. This will clear the video list but keep your saved API keys.

## Technologies Used

-   **Frontend:** React, TypeScript, Tailwind CSS
-   **AI Model:** Google Gemini (`gemini-2.5-flash`) via the `@google/genai` SDK
-   **Data Scraping:** Apify (utilizing various actors for TikTok and Facebook)
-   **Browser APIs:** `localStorage`, `fetch`, `FileReader`
