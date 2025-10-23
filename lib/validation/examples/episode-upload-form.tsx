// ============================================================================
// Episode Upload Form Implementation Example
// SimplyCaster Centralized Form Validation System
// ============================================================================

/** @jsx h */
/** @jsxFrag Fragment */
import { h, JSX, Fragment } from "preact";
import { useState, useRef } from "preact/hooks";
import { useFormValidation } from "../hooks.ts";
import { episodeUploadSchema } from "../schemas.ts";
import type { EpisodeUploadData } from "../schemas.ts";

/**
 * Complete episode upload form implementation with validation
 * Demonstrates:
 * - File upload validation (size, type, content)
 * - Drag and drop file upload
 * - Upload progress tracking
 * - Audio file preview
 * - Metadata extraction from ID3 tags
 * - Real-time validation feedback
 * - Accessibility features for file uploads
 */
export function EpisodeUploadForm(): JSX.Element {
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [extractedMetadata, setExtractedMetadata] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize form validation with schema
  const form = useFormValidation<EpisodeUploadData>(
    episodeUploadSchema,
    {
      title: '',
      description: '',
      file: null,
      episodeNumber: undefined
    }
  );

  // Handle successful form submission
  const handleSubmit = async (data: EpisodeUploadData) => {
    try {
      console.log('Uploading episode:', data);
      
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('title', data.title);
      formData.append('description', data.description || '');
      formData.append('file', data.file as File);
      if (data.episodeNumber) {
        formData.append('episodeNumber', data.episodeNumber.toString());
      }

      // Simulate upload with progress
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(progress);
        }
      });

      const uploadPromise = new Promise<any>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200 || xhr.status === 201) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
      });

      xhr.open('POST', '/api/episodes/upload');
      xhr.send(formData);

      const result = await uploadPromise;
      console.log('Upload successful:', result);
      
      setUploadSuccess(true);
      setUploadProgress(100);
      form.reset();
      setAudioPreview(null);
      setExtractedMetadata(null);
      
    } catch (error) {
      console.error('Upload error:', error);
      setUploadProgress(0);
      form.setSubmissionError('Upload failed. Please try again.');
    }
  };

  // Handle file selection
  const handleFileSelect = async (file: File) => {
    form.setFieldValue('file', file);
    
    // Create audio preview URL
    const previewUrl = URL.createObjectURL(file);
    setAudioPreview(previewUrl);
    
    // Extract metadata from audio file (simulated)
    try {
      const metadata = await extractAudioMetadata(file);
      setExtractedMetadata(metadata);
      
      // Auto-fill form fields from metadata
      if (metadata.title && !form.getFieldValue('title')) {
        form.setFieldValue('title', metadata.title);
      }
      if (metadata.description && !form.getFieldValue('description')) {
        form.setFieldValue('description', metadata.description);
      }
      if (metadata.track && !form.getFieldValue('episodeNumber')) {
        form.setFieldValue('episodeNumber', parseInt(metadata.track));
      }
    } catch (error) {
      console.warn('Could not extract metadata:', error);
    }
  };

  // Simulate metadata extraction
  const extractAudioMetadata = async (file: File): Promise<any> => {
    // In a real implementation, this would use a library like jsmediatags
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          title: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
          duration: Math.floor(Math.random() * 3600), // Random duration
          bitrate: 128,
          sampleRate: 44100,
          channels: 2
        });
      }, 500);
    });
  };

  // Handle drag and drop
  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('audio/')) {
        handleFileSelect(file);
      } else {
        form.setFieldError('file', 'Please select an audio file');
      }
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format duration
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  if (uploadSuccess) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md text-center">
        <div className="mb-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Episode Uploaded Successfully!</h2>
          <p className="text-gray-600 mb-6">
            Your episode has been uploaded and is being processed. It will be available in your feed shortly.
          </p>
          <button
            onClick={() => setUploadSuccess(false)}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Upload Another Episode
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload New Episode</h2>
        <p className="text-gray-600">Add a new episode to your podcast feed</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.submitForm(handleSubmit);
        }}
        className="space-y-6"
        noValidate
        aria-label="Episode upload form"
      >
        {/* File Upload Area */}
        <div className="field-group">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Audio File
            <span className="text-red-500 ml-1" aria-label="required">*</span>
          </label>
          
          <div
            className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              dragActive
                ? 'border-blue-500 bg-blue-50'
                : form.hasFieldError('file') && form.isFieldTouched('file')
                ? 'border-red-500 bg-red-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/mpeg,audio/ogg,audio/webm,audio/wav"
              onChange={(e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleFileSelect(file);
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-describedby="file-help file-error"
              aria-invalid={form.hasFieldError('file')}
            />
            
            {form.getFieldValue('file') ? (
              <div className="space-y-2">
                <svg className="w-12 h-12 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <div className="text-sm text-gray-900 font-medium">
                  {(form.getFieldValue('file') as File)?.name}
                </div>
                <div className="text-xs text-gray-500">
                  {formatFileSize((form.getFieldValue('file') as File)?.size || 0)}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    form.setFieldValue('file', null);
                    setAudioPreview(null);
                    setExtractedMetadata(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <svg className="w-12 h-12 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <div className="text-sm text-gray-600">
                  <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
                </div>
                <div className="text-xs text-gray-500">
                  MP3, OGG, WebM or WAV (max 100MB)
                </div>
              </div>
            )}
          </div>
          
          <div id="file-help" className="text-xs text-gray-500 mt-1">
            Upload your podcast episode audio file
          </div>
          
          {form.hasFieldError('file') && form.isFieldTouched('file') && (
            <div id="file-error" role="alert" className="text-red-600 text-sm mt-1 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {form.getFieldError('file')}
            </div>
          )}
        </div>

        {/* Audio Preview */}
        {audioPreview && (
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Audio Preview</h3>
            <audio controls className="w-full">
              <source src={audioPreview} type={(form.getFieldValue('file') as File)?.type} />
              Your browser does not support the audio element.
            </audio>
            
            {extractedMetadata && (
              <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-medium text-gray-600">Duration:</span>
                  <span className="ml-1 text-gray-900">{formatDuration(extractedMetadata.duration)}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Bitrate:</span>
                  <span className="ml-1 text-gray-900">{extractedMetadata.bitrate} kbps</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Sample Rate:</span>
                  <span className="ml-1 text-gray-900">{extractedMetadata.sampleRate} Hz</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Channels:</span>
                  <span className="ml-1 text-gray-900">{extractedMetadata.channels === 2 ? 'Stereo' : 'Mono'}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Episode Title */}
        <div className="field-group">
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Episode Title
            <span className="text-red-500 ml-1" aria-label="required">*</span>
          </label>
          <input
            id="title"
            type="text"
            value={form.getFieldValue('title') || ''}
            onChange={(e) => form.setFieldValue('title', (e.target as HTMLInputElement).value)}
            onBlur={() => form.touchField('title')}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors ${
              form.hasFieldError('title') && form.isFieldTouched('title')
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:ring-blue-500'
            }`}
            placeholder="Enter episode title"
            aria-invalid={form.hasFieldError('title')}
            aria-describedby={form.hasFieldError('title') ? 'title-error' : 'title-help'}
            aria-required="true"
          />
          <div id="title-help" className="text-xs text-gray-500 mt-1">
            Give your episode a descriptive title
          </div>
          {form.hasFieldError('title') && form.isFieldTouched('title') && (
            <div id="title-error" role="alert" className="text-red-600 text-sm mt-1 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {form.getFieldError('title')}
            </div>
          )}
        </div>

        {/* Episode Description */}
        <div className="field-group">
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Episode Description
          </label>
          <textarea
            id="description"
            rows={4}
            value={form.getFieldValue('description') || ''}
            onChange={(e) => form.setFieldValue('description', (e.target as HTMLTextAreaElement).value)}
            onBlur={() => form.touchField('description')}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors resize-vertical ${
              form.hasFieldError('description') && form.isFieldTouched('description')
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:ring-blue-500'
            }`}
            placeholder="Describe what this episode is about..."
            aria-invalid={form.hasFieldError('description')}
            aria-describedby={form.hasFieldError('description') ? 'description-error' : 'description-help'}
          />
          <div id="description-help" className="text-xs text-gray-500 mt-1 flex justify-between">
            <span>Optional episode description for your listeners</span>
            <span>{(form.getFieldValue('description') || '').length}/1000</span>
          </div>
          {form.hasFieldError('description') && form.isFieldTouched('description') && (
            <div id="description-error" role="alert" className="text-red-600 text-sm mt-1 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {form.getFieldError('description')}
            </div>
          )}
        </div>

        {/* Episode Number */}
        <div className="field-group">
          <label htmlFor="episodeNumber" className="block text-sm font-medium text-gray-700 mb-1">
            Episode Number
          </label>
          <input
            id="episodeNumber"
            type="number"
            min="1"
            max="9999"
            value={form.getFieldValue('episodeNumber') || ''}
            onChange={(e) => {
              const value = (e.target as HTMLInputElement).value;
              form.setFieldValue('episodeNumber', value ? parseInt(value) : undefined);
            }}
            onBlur={() => form.touchField('episodeNumber')}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors ${
              form.hasFieldError('episodeNumber') && form.isFieldTouched('episodeNumber')
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:ring-blue-500'
            }`}
            placeholder="e.g., 1"
            aria-invalid={form.hasFieldError('episodeNumber')}
            aria-describedby={form.hasFieldError('episodeNumber') ? 'episodeNumber-error' : 'episodeNumber-help'}
          />
          <div id="episodeNumber-help" className="text-xs text-gray-500 mt-1">
            Optional episode number for organization
          </div>
          {form.hasFieldError('episodeNumber') && form.isFieldTouched('episodeNumber') && (
            <div id="episodeNumber-error" role="alert" className="text-red-600 text-sm mt-1 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {form.getFieldError('episodeNumber')}
            </div>
          )}
        </div>

        {/* Upload Progress */}
        {form.isSubmitting && uploadProgress > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-800">Uploading Episode</span>
              <span className="text-sm text-blue-600">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <div className="text-xs text-blue-600 mt-1" aria-live="polite">
              {uploadProgress < 100 ? 'Uploading file...' : 'Processing episode...'}
            </div>
          </div>
        )}

        {/* Form-level errors */}
        {form.hasSubmissionError() && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3" role="alert">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="text-red-800 text-sm">
                {form.getSubmissionError()}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-4">
          <button
            type="submit"
            disabled={!form.isValid || form.isSubmitting}
            className={`flex-1 py-3 px-4 rounded-md font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              !form.isValid || form.isSubmitting
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
            }`}
          >
            {form.isSubmitting ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Uploading...
              </div>
            ) : (
              'Upload Episode'
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              form.reset();
              setAudioPreview(null);
              setExtractedMetadata(null);
              setUploadProgress(0);
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
            className="px-6 py-3 border border-gray-300 rounded-md font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}

export default EpisodeUploadForm;