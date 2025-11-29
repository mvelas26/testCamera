import { useState, useEffect, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import ReactDOM from 'react-dom';
import DFX3 from 'Resources/DFX3.json';
import Tesseract from 'tesseract.js';

// --- Utility Functions (Extracted for use in both components) ---

const getTypeDisplayName = (type) => { 
    if (!type) return 'N/A';
    return type.replace(/_/g, ' ').toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const getTypeColor = (type) => {
    switch (type) {
        case "STAGING_AREA": return '#3498db'; // Blue
        case "STACKING_AREA": return '#2ecc71'; // Green
        case "GENERAL_AREA": return '#f39c12'; // Yellow/Orange
        default: return '#95a5a6'; // Gray
    }
};

// --- End Utility Functions ---


const QRCodeGenerator = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState(null);
  const [scanHistory, setScanHistory] = useState([]);
  const [showModularCamera, setShowModularCamera] = useState(false); // Controls modal visibility

  const searchInputRef = useRef(null);
  const resultsContainerRef = useRef(null);
  const suggestionsRef = useRef(null);
  
  // Initialize areas data with type information
  const [areas, setAreas] = useState({
    STAGING_AREA: [],
    STACKING_AREA: [],
    GENERAL_AREA: [],
    OTHER_AREA: []
  });

  // Check camera support on component mount
  const [cameraSupported, setCameraSupported] = useState(true);
  useEffect(() => {
    const checkCameraSupport = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraSupported(false);
          return;
        }

        const isSecure = window.location.protocol === 'https:' || 
                        window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1';
        
        if (!isSecure) {
          setCameraSupported(false);
          return;
        }

        setCameraSupported(true);
      } catch (err) {
        console.error('Camera support check failed:', err);
        setCameraSupported(false);
      }
    };

    checkCameraSupport();
  }, []);

  // Modular Camera Component
  const ModularCamera = ({ onScanComplete, onClose }) => { 
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const captureIntervalRef = useRef(null);
    const workerRef = useRef(null); 

    const [isScanning, setIsScanning] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isLoadingCameras, setIsLoadingCameras] = useState(false);
    const [availableCameras, setAvailableCameras] = useState([]);
    const [selectedCamera, setSelectedCamera] = useState('');
    const [cameraError, setCameraError] = useState('');
    const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
    const [lastScannedText, setLastScannedText] = useState('');
    const [detectedText, setDetectedText] = useState('');
    const [shouldStart, setShouldStart] = useState(false); 
    
    // Holds the result object to display the QR code
    const [scannedResult, setScannedResult] = useState(null); 

    const camerasRef = useRef([]);
    const selectedCameraRef = useRef('');

    // Get available cameras
    const getCameras = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) {
        return [];
      }

      try {
        setIsLoadingCameras(true);
        // Request media permission once to ensure we get labels
        await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); 

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        const camerasList = videoDevices.map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${videoDevices.indexOf(device) + 1}`
        }));
        
        setAvailableCameras(camerasList);
        camerasRef.current = camerasList;
        
        if (camerasList.length > 0) {
          const backCamera = camerasList.find(c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('environment')) || camerasList[0];
          
          if (!selectedCamera) {
              setSelectedCamera(backCamera.deviceId);
              selectedCameraRef.current = backCamera.deviceId;
          }

          // *** CHANGE 1: Automatically trigger the start sequence if a camera is available ***
          setShouldStart(true); 
          // *** END CHANGE 1 ***
        }

        return camerasList;
      } catch (err) {
        console.warn("Could not enumerate cameras, continuing with default access.", err);
        return [];
      } finally {
        // NOTE: We keep isLoadingCameras as true if camerasList is empty until an error is set
        // to show a status, but for this component, we set it to false here.
        setIsLoadingCameras(false);
      }
    };

    const stopCamera = () => {
      console.log('Stopping camera...');
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
        });
        streamRef.current = null;
      }
      
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
      
      // Cleanup Tesseract worker
      if (workerRef.current) {
        console.log('Terminating Tesseract worker...');
        workerRef.current.terminate();
        workerRef.current = null;
      }
      
      // Reset all camera related states
      setShouldStart(false); 
      setIsScanning(false);
      setIsProcessing(false);
      setCameraError('');
      setVideoDimensions({ width: 0, height: 0 });
      setLastScannedText('');
      setDetectedText('');
      setScannedResult(null); 
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
    
    // Tesseract Worker Initialization (runs once on mount)
    useEffect(() => {
      setIsLoadingCameras(true); // Set loading while we detect cameras and worker
      
      getCameras();
      
      const initializeWorker = async () => {
        console.log('Initializing Tesseract worker...');
        try {
            const worker = await Tesseract.createWorker('eng'); 
            
            await worker.setParameters({
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- .'
            });
            
            workerRef.current = worker;
            console.log('Tesseract worker initialized and ready.');
        } catch (error) {
            console.error('Failed to initialize Tesseract worker:', error);
            setCameraError('Failed to load OCR library. Check network and console for details.');
        }
      };
      
      initializeWorker();

      return () => stopCamera(); 
    }, []);

    // 1. Core function to initialize the video stream
    const initVideo = async (cameraDeviceId) => {
        try {
            setCameraError('');
            // NOTE: setIsLoadingCameras is kept true until video starts playing or fails
            setScannedResult(null); 

            if (!videoRef.current) {
                console.error('Video ref not available in initVideo.');
                setIsLoadingCameras(false);
                setCameraError('Camera not ready. Please close and reopen the camera.');
                return; 
            }
            
            if (!canvasRef.current) {
              const canvas = document.createElement('canvas');
              canvasRef.current = canvas;
            }

            const constraints = {
              video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'environment' 
              } 
            };

            const currentSelectedCamera = cameraDeviceId || selectedCamera || selectedCameraRef.current;
            if (currentSelectedCamera && availableCameras.length > 0) {
              constraints.video.deviceId = { exact: currentSelectedCamera };
              delete constraints.video.facingMode;
            }

            console.log('Starting camera with constraints:', constraints);
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            streamRef.current = stream;
            videoRef.current.srcObject = stream;
            
            const video = videoRef.current;
            
            const waitForVideoReady = () => {
              return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                  reject(new Error('Video not ready within timeout'));
                }, 10000); 

                const checkReadyState = () => {
                  if (video.readyState >= 1) {
                    clearTimeout(timeout);
                    resolve();
                    return;
                  }
                  setTimeout(checkReadyState, 100);
                };

                video.onloadedmetadata = () => {
                  clearTimeout(timeout);
                  resolve();
                };

                video.onerror = (err) => {
                  clearTimeout(timeout);
                  reject(new Error(`Video error: ${err}`));
                };

                checkReadyState();
              });
            };

            await waitForVideoReady();
            
            try {
              await video.play();
            } catch (playErr) {
              console.warn('Video play failed, continuing anyway:', playErr);
            }
            
            setVideoDimensions({ 
              width: video.videoWidth || 640, 
              height: video.videoHeight || 480 
            });
            
            setIsScanning(true);
            setIsLoadingCameras(false);
            startOCRCapturing();
            
            console.log('Camera started successfully');

          } catch (err) {
            console.error('Camera start error:', err);
            setIsLoadingCameras(false);
            stopCamera();
            
            let errorMessage = 'Cannot access camera: ';
            
            if (err.name === 'NotAllowedError') {
              errorMessage = 'Camera permission denied. Please allow camera access in your browser settings.';
            } else if (err.name === 'NotFoundError') {
              errorMessage = 'No camera found on this device.';
            } else if (err.name === 'NotReadableError') {
              errorMessage = 'Camera is already in use by another application.';
            } else if (err.name === 'OverconstrainedError') {
              errorMessage = 'Camera constraints cannot be satisfied. Try a different camera.';
            } else {
              errorMessage += err.message;
            }
            
            setCameraError(errorMessage);
          }
    };

    // 2. Public function to trigger the camera start (Used only for retry/manual re-init now)
    const startCamera = () => {
        setCameraError(''); // Clear error before retry
        setShouldStart(true);
    };

    // 3. Effect hook to wait for the video ref before calling initVideo
    useEffect(() => {
        if (shouldStart && videoRef.current) {
            console.log('Video ref is now available. Initializing video stream...');
            setShouldStart(false); // Reset start flag
            initVideo(selectedCamera);
        }
    }, [shouldStart, selectedCamera]); 
    
    // 4. Effect to pause continuous scanning when a result is found
    useEffect(() => {
        if (scannedResult && captureIntervalRef.current) {
            console.log('QR Code generated. Pausing continuous OCR scanning.');
            clearInterval(captureIntervalRef.current);
            captureIntervalRef.current = null;
        } 
        
        return () => {
             if (captureIntervalRef.current) {
                 clearInterval(captureIntervalRef.current);
                 captureIntervalRef.current = null;
             }
        };
    }, [scannedResult]); 

    const startOCRCapturing = () => {
      console.log('Starting OCR capturing...');
      
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
      
      // Interval set to 3s (3000ms)
      captureIntervalRef.current = setInterval(() => {
        console.log('--- OCR Interval Tick Attempt (3s) ---'); 
        
        if (scannedResult) {
            console.log('Result active, skipping scan tick.');
            return;
        }
        
        if (!streamRef.current || !videoRef.current || isProcessing || !workerRef.current) {
          return;
        }
        
        captureAndProcessFrame();
      }, 1500); 
    };

    const captureAndProcessFrame = async () => {
      const video = videoRef.current;
      let canvas = canvasRef.current;
      
      if (isProcessing || !video || !streamRef.current || video.videoWidth === 0 || !workerRef.current) {
        return;
      }

      if (scannedResult) {
          console.log('Already displaying result. Aborting frame processing.');
          return;
      }

      if (!canvas) {
        canvas = document.createElement('canvas');
        canvasRef.current = canvas;
      }

      setIsProcessing(true);
      setDetectedText('Scanning...'); 
      
      try {
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const { data: { text } } = await workerRef.current.recognize(canvas);

        console.log('OCR Result:', text);
        
        if (text && text.trim()) {
          const processedText = processOCRText(text);
          setDetectedText(processedText || text.trim());
          
          if (processedText && processedText !== lastScannedText) {
            console.log('Found new unique location:', processedText);
            handleScannedText(processedText);
            setLastScannedText(processedText);
          } else if (processedText && processedText === lastScannedText) {
            console.log('Location is the same, skipping update.');
          }
        } else {
          setDetectedText('No text detected or recognized.');
          setScannedResult(null); 
        }
      } catch (err) {
        console.error('OCR processing error:', err);
        setDetectedText('Error processing image');
        setScannedResult(null); 
      } finally {
        setIsProcessing(false);
      }
    };

    const processOCRText = (text) => {
      let cleanedText = text.trim()
        .replace(/\s+/g, ' ')
        .toUpperCase();
      
      const patterns = [
        /([A-Z])-(\d+)\s+(\d+)([A-Z])/,
        /([A-Z])(\d+)\s+(\d+)([A-Z])/,
        /([A-Z])-(\d+)\.(\d+)([A-Z])/,
        /([A-Z])(\d+)(\d+)([A-Z])/,
        /([A-Z])\s+(\d+)\s+(\d+)\s+([A-Z])/
      ];
      
      for (const pattern of patterns) {
        const match = cleanedText.match(pattern);
        if (match) {
          const [, letter, firstNum, secondNum, endingLetter] = match;
          const result = `${letter}-${firstNum.replace(/-/g, '')}.${secondNum}${endingLetter}`;
          return result;
        }
      }
      
      const locationPattern = /[A-Z]-?\d+\.?\d*[A-Z]?|STG\.[A-Z]\d{2,3}/;
      const locationMatch = cleanedText.match(locationPattern);
      if (locationMatch) {
        return locationMatch[0];
      }
      
      return null;
    };

    const handleScannedText = (scannedText) => {
      if (onScanComplete) {
        onScanComplete(scannedText, setScannedResult);
      }
    };

    const captureManual = () => {
      if (!isScanning || isProcessing || !streamRef.current || scannedResult) {
        if (scannedResult) {
            alert("Clear the current result before scanning manually.");
        }
        return;
      }
      captureAndProcessFrame();
    };

    const switchCamera = async (deviceId) => {
      setSelectedCamera(deviceId);
      selectedCameraRef.current = deviceId;
      if (isScanning) {
        stopCamera();
        // Since we removed the start button, we re-trigger the auto-start sequence
        setTimeout(() => startCamera(), 500); // startCamera sets setShouldStart(true)
      }
    };

    const handleClearResult = () => {
        setScannedResult(null);
        setDetectedText('');
        setLastScannedText('');
        // Restart continuous scanning when result is cleared
        if (isScanning && !captureIntervalRef.current) {
            startOCRCapturing();
        }
    }

    const handleClose = () => {
      stopCamera();
      if (onClose) {
        onClose();
      }
    };

    return (
      <div className="modular-camera-overlay">
        <div className="modular-camera-container">
          <div className="camera-header">
            <h3>📷 Live Camera Scanner</h3>
            <div className="camera-controls">
              <button 
                type="button" 
                onClick={captureManual}
                className="capture-button"
                disabled={isProcessing || !isScanning || scannedResult} 
              >
                {isProcessing ? 'Processing...' : '📸 Capture Now'}
              </button>
              <button 
                type="button" 
                onClick={handleClose}
                className="close-camera-button"
              >
                ✕ Close
              </button>
            </div>
          </div>

          <div className="camera-content-wrapper"> 
            
            <div className="video-container" style={{ display: isScanning ? 'block' : 'none' }}>
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline
                muted
                className="camera-video"
                key="camera-video-element"
              />
              
              {/* Scan Overlay (Only show when actively scanning) */}
              {isScanning && (
                <div className="scan-overlay">
                  <div className="scan-frame">
                    <div className="scan-corner top-left"></div>
                    <div className="scan-corner top-right"></div>
                    <div className="scan-corner bottom-left"></div>
                    <div className="scan-corner bottom-right"></div>
                  </div>
                  <p className="scan-message">Point camera at location text</p>
                  <p className="scan-hint">e.g., "B-17 1B" → "B-17.1B"</p>
                  
                  {detectedText && (
                    <div className="detected-text">
                      <strong>Detected:</strong> {detectedText}
                    </div>
                  )}
                  
                  {isProcessing && (
                    <div className="processing-indicator">
                      <div className="spinner"></div>
                      Reading text...
                    </div>
                  )}

                  {/* Display the QR code if a result is found */}
                  {scannedResult && (
                      <div className="scanned-qr-code-display">
                          <h4>✅ Code Found: {scannedResult.location}</h4>
                          <div className="qr-code-wrapper-modal">
                              <QRCodeCanvas 
                                value={scannedResult.referenceId || 'NO_REF_ID_FOUND'} 
                                size={120} 
                                level="H"
                                includeMargin={true}
                              />
                          </div>
                          <div className="qr-code-details-modal">
                              <div className="location-modal">{scannedResult.location}</div>
                              <div 
                                className="type-modal" 
                                style={{ color: getTypeColor(scannedResult.type) }}
                              >
                                  {getTypeDisplayName(scannedResult.type)}
                              </div>
                              <div className="reference-id-modal">Ref: {scannedResult.referenceId}</div>
                          </div>
                          <button 
                            onClick={handleClearResult} 
                            className="clear-result-button"
                          >
                            Clear Result & Resume Scan
                          </button>
                      </div>
                  )}
                </div>
              )}
            </div>

            {/* Camera Setup Controls (Visible only when NOT scanning) */}
            {!isScanning && (
                <div className="camera-setup">
                    {/* Camera Selection Dropdown */}
                    <div className="camera-selection">
                        <label htmlFor="modular-camera-select">Select Camera:</label>
                        <select 
                          id="modular-camera-select"
                          value={selectedCamera}
                          onChange={(e) => switchCamera(e.target.value)}
                          disabled={isLoadingCameras || availableCameras.length === 0}
                        >
                          {isLoadingCameras ? (
                            <option>Loading cameras...</option>
                          ) : availableCameras.length === 0 ? (
                            <option>No cameras detected</option>
                          ) : (
                            availableCameras.map(camera => (
                              <option key={camera.deviceId} value={camera.deviceId}>
                                {camera.label}
                              </option>
                            ))
                          )}
                        </select>
                    </div>
                    
                    {/* Status Message for Auto-Start */}
                    {availableCameras.length > 0 && !cameraError && (
                        <div className="starting-message-status">
                            <div className="spinner-large"></div>
                            <p>Camera starting automatically...</p>
                            <p className="subtle-hint">Please allow permissions if prompted.</p>
                        </div>
                    )}

                    {/* Show a dedicated Retry Button if there's an error */}
                    {cameraError && (
                      <button 
                        type="button" 
                        onClick={startCamera} 
                        className="retry-camera-button"
                      >
                        🔄 Retry Starting Camera
                      </button>
                    )}
                    
                    {/* Message if no cameras are found */}
                    {availableCameras.length === 0 && !isLoadingCameras && !cameraError && (
                        <div className="no-camera-message-status">
                            <p>No video input devices found. Check permissions and try again.</p>
                        </div>
                    )}
                </div>
            )}
            
            {/* Active Scan Controls/Status (Visible only when scanning) */}
            {isScanning && (
              <>
                {/* Camera Switcher during active scan */}
                {availableCameras.length > 1 && (
                  <div className="active-camera-controls">
                    <label>Switch Camera:</label>
                    <select 
                      value={selectedCamera}
                      onChange={(e) => switchCamera(e.target.value)}
                      className="camera-switcher"
                      disabled={isLoadingCameras}
                    >
                      {availableCameras.map(camera => (
                        <option key={camera.deviceId} value={camera.deviceId}>
                          {camera.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="camera-status">
                  {scannedResult ? (
                    <p className="scan-paused-message">
                       ⏸️ Scan Paused (Clear Result to Resume)
                    </p>
                  ) : (
                    <p>
                      ✅ Camera Active • Scanning every 3 seconds
                    </p>
                  )}
                  {detectedText && detectedText !== 'Scanning...' && detectedText !== 'No text detected or recognized.' && (
                    <p className="text-change-info">
                      🔄 Will auto-detect when text changes
                    </p>
                  )}
                </div>
              </>
            )}

            {cameraError && (
              <div className="camera-error-message">
                {cameraError}
              </div>
            )}

          </div> 
          
          {/* Hidden canvas for OCR processing */}
          <canvas 
            ref={canvasRef} 
            style={{ display: 'none' }}
            key="hidden-canvas"
          />

        </div>
        
        <style jsx>{`
          .modular-camera-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            padding: 1rem;
          }

          .modular-camera-container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            max-width: 800px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
          }

          .camera-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5rem;
            background: #2c3e50;
            color: white;
            border-radius: 12px 12px 0 0;
          }

          .camera-header h3 {
            margin: 0;
            font-size: 1.3rem;
          }

          .camera-controls {
            display: flex;
            gap: 0.5rem;
          }

          .capture-button {
            padding: 0.5rem 1rem;
            background: #27ae60;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
          }

          .capture-button:disabled {
            background: #95a5a6;
            cursor: not-allowed;
          }

          .close-camera-button {
            padding: 0.5rem 1rem;
            background: #e74c3c;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
          }

          .camera-content-wrapper { 
             padding: 1.5rem; 
          }

          .camera-setup {
            padding: 0; 
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }

          .camera-selection {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }

          .camera-selection label {
            font-weight: 600;
            color: #2c3e50;
          }

          .camera-selection select {
            padding: 0.75rem;
            border: 2px solid #ddd;
            border-radius: 6px;
            font-size: 1rem;
          }
          
          /* New Auto-Start Status Message Styles */
          .starting-message-status {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 0.75rem;
              padding: 1.5rem;
              background: #eaf4ff;
              border: 1px solid #cce5ff;
              border-radius: 8px;
              color: #004085;
              text-align: center;
          }
          
          .no-camera-message-status {
              padding: 1.5rem;
              background: #f8d7da;
              border: 1px solid #f5c6cb;
              border-radius: 8px;
              color: #721c24;
              text-align: center;
          }
          
          .spinner-large { 
              width: 32px;
              height: 32px;
              border: 4px solid transparent;
              border-top: 4px solid #3498db;
              border-radius: 50%;
              animation: spin 1s linear infinite;
          }

          .subtle-hint {
              font-size: 0.85rem;
              color: #004085;
              opacity: 0.8;
          }
          /* End New Auto-Start Status Message Styles */


          .retry-camera-button {
            padding: 1rem;
            background: #f39c12;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.3s;
          }

          .retry-camera-button:hover {
            background: #e67e22;
          }

          .video-container {
            position: relative;
            width: 100%;
            background: #000;
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 1rem;
            min-height: 200px; 
          }

          .camera-video {
            width: 100%;
            height: 400px;
            display: block;
            object-fit: cover;
            background: #000;
          }

          .scan-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background: transparent;
            color: white;
            text-align: center;
            padding: 1rem;
            pointer-events: none;
            overflow-y: auto; 
          }

          .scan-frame {
            width: 250px;
            height: 100px;
            border: 2px solid white;
            border-radius: 8px;
            margin-bottom: 1rem;
            position: relative;
          }

          .scan-corner {
            position: absolute;
            width: 20px;
            height: 20px;
            border: 2px solid #00ff00;
          }

          .scan-corner.top-left {
            top: -2px;
            left: -2px;
            border-right: none;
            border-bottom: none;
          }

          .scan-corner.top-right {
            top: -2px;
            right: -2px;
            border-left: none;
            border-bottom: none;
          }

          .scan-corner.bottom-left {
            bottom: -2px;
            left: -2px;
            border-right: none;
            border-top: none;
          }

          .scan-corner.bottom-right {
            bottom: -2px;
            right: -2px;
            border-left: none;
            border-top: none;
          }

          .scan-message {
            margin-bottom: 0.5rem;
          }

          .scan-hint {
            font-size: 0.9rem;
            opacity: 0.8;
            margin-top: 0.5rem;
          }

          .detected-text {
            background: rgba(0, 0, 0, 0.8);
            padding: 0.75rem 1rem;
            border-radius: 6px;
            margin-top: 1rem;
            font-size: 1rem;
            border: 2px solid #3498db;
            word-break: break-all;
            pointer-events: auto;
          }
          
          .scanned-qr-code-display {
            position: absolute; 
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            
            background: rgba(255, 255, 255, 0.98); 
            padding: 1.5rem;
            border-radius: 12px;
            box-shadow: 0 0 15px rgba(0, 0, 0, 0.5); 
            display: flex;
            flex-direction: column;
            align-items: center;
            pointer-events: auto;
            max-width: 90%;
            z-index: 10; 
          }

          .scanned-qr-code-display h4 {
            color: #2c3e50;
            margin: 0 0 1rem 0;
            font-size: 1.2rem;
          }

          .qr-code-details-modal {
            margin-top: 0.75rem;
            text-align: center;
            color: #2c3e50;
          }

          .location-modal {
            font-weight: 700;
            font-size: 1rem;
          }

          .type-modal {
            font-weight: 600;
            font-size: 0.85rem;
            margin: 0.25rem 0;
          }

          .reference-id-modal {
            font-size: 0.75rem;
            color: #7f8c8d;
            word-break: break-all;
          }

          .clear-result-button {
              margin-top: 1rem;
              padding: 0.5rem 1rem;
              background-color: #f39c12;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-weight: 600;
              transition: background 0.2s;
          }
          .clear-result-button:hover {
              background-color: #e67e22;
          }

          .processing-indicator {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-top: 1rem;
            padding: 0.75rem 1rem;
            background: rgba(0, 0, 0, 0.7);
            border-radius: 20px;
          }

          .spinner {
            width: 16px;
            height: 16px;
            border: 2px solid transparent;
            border-top: 2px solid #00ff00;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }

          .active-camera-controls {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 1rem;
            padding: 0.5rem;
            background: #f8f9fa;
            border-radius: 6px;
          }

          .active-camera-controls label {
            font-weight: 600;
            color: #2c3e50;
            white-space: nowrap;
          }

          .camera-switcher {
            padding: 0.5rem;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: white;
          }
          
          .scan-paused-message {
             background: #fcf8e3; 
             color: #8a6d3b; 
             padding: 0.5rem;
             border-radius: 4px;
          }

          .camera-status {
            padding: 1rem;
            background: #d4edda;
            color: #155724;
            border-radius: 6px;
            text-align: center;
          }

          .text-change-info {
            margin: 0.5rem 0 0 0;
            font-weight: 600;
          }

          .camera-error-message {
            margin: 1rem 0;
            padding: 1rem;
            background: #f8d7da;
            color: #721c24;
            border-radius: 6px;
            border-left: 4px solid #e74c3c;
          }

          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          @media (max-width: 768px) {
            .modular-camera-overlay {
              padding: 0.5rem;
            }

            .camera-header {
              flex-direction: column;
              gap: 1rem;
              text-align: center;
            }

            .camera-controls {
              width: 100%;
              justify-content: center;
            }

            .camera-video {
              height: 300px;
            }

            .active-camera-controls {
              flex-direction: column;
              align-items: stretch;
            }
          }
        `}</style>
      </div>
    );
  };

  // Quick Links Dropdown Component
  const QuickLinksDropdown = () => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const links = [
      { name: 'Station Command', url: 'https://logistics.amazon.com/station/dashboard/sortBoard' },
      { name: 'Inbound', url: 'https://trans-logistics.amazon.com/ssp/dock/hrz/ib' },
      { name: 'FCLM', url: 'https://fclm-portal.amazon.com/ppa/inspect/process' },
      { name: 'Perfect Mile', url: 'https://perfectmile-na.amazon.com/dashboards/aidenngo/location/DFX3/daily?tab=54863&start-date=2022-01-30&end-date=2022-02-05&drilldowns=cycle_name/dsp' },
      { name: 'STEM', url: 'https://stem-na.corp.amazon.com/node/DFX3/equipment' },
      { name: 'Employee Time Details', url: 'https://fclm-portal.amazon.com/employee/ppaTimeDetails?warehouseId=DFX3' },
      { name: 'Apollo', url: 'https://apollo-audit.corp.amazon.com/' },
      { name: 'Routing Tools', url: 'https://routingtools-na.amazon.com/clusterTransfer.jsp' },
      { name: 'Barcode Generator', url: 'https://www.barcode-generator.de/V2/en/index.jsp' },
      { name: 'Start Ops', url: 'https://start.wwops.amazon.dev/?businessUnitId=IjE2Ig%3D%3D&topLevelFilters=eyI0IjoiNDEiLCI5NSI6IjQyNzgifQ%3D%3D' }
    ];

    return (
      <div className="quick-links-container" ref={dropdownRef}>
        <button 
          className="quick-links-button"
          onClick={() => setIsOpen(!isOpen)}
        >
          Quick Links
          <span className={`dropdown-arrow ${isOpen ? 'open' : ''}`}>▼</span>
        </button>
        
        {isOpen && (
          <div className="quick-links-dropdown">
            {links.map((link, index) => (
              <div key={index} className="quick-link-item">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="quick-link-link"
                >
                  {link.name}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Utility functions
  const generateRange = (prefix, start, end) => {
    const locations = [];
    for (let i = start; i <= end; i++) {
      locations.push(`${prefix}${i}`);
    }
    return locations;
  };

  const formatInput = (value) => {
    if (!value) return [];
    
    value = value.toUpperCase().trim();

    const rangeMatch = value.match(/^([A-Z]+)(\d+)\s*-\s*([A-Z]+)(\d+)$/);
    if (rangeMatch && rangeMatch[1] === rangeMatch[3]) {
      const prefix = rangeMatch[1];
      const start = parseInt(rangeMatch[2], 10);
      const end = parseInt(rangeMatch[4], 10);
      
      if (start <= end) {
        return generateRange(prefix, start, end);
      }
      return [value];
    }

    const patternMatch = value.match(/^([A-Z])(\d{1,2})(\d)([A-Z])$/);
    if (patternMatch) {
      const [, letter, firstDigits, lastDigit, endingLetter] = patternMatch;
      return [`${letter}-${firstDigits}.${lastDigit}${endingLetter}`];
    }

    if (value.length === 3 && value !== "RTS" && !/AX|AV|RX|RV/.test(value)) {
      return [`STG.${value}`];
    }
    else if (value.length === 2 && /[ABCDEGHJKLM]/.test(value) && !/AX|AV|RX|RV/.test(value)) {
      return [`STG.${value.charAt(0)}0${value.charAt(1)}`];
    }
    else if (value.includes("DD")) {
      return [value];
    }
    else if (value.length < 7 && /[ABCDEGJKLM]/.test(value) && !/OV|-|STG|AX|AV|RX|RV/.test(value)) {
      return [`${value.charAt(0)}-${value.slice(1)}`];
    }

    return [value];
  };

  const findReferenceId = (location) => {
    const allAreas = [
      ...areas.STAGING_AREA,
      ...areas.STACKING_AREA,
      ...areas.GENERAL_AREA,
      ...areas.OTHER_AREA
    ];
    
    const found = allAreas.find(item => item.location === location);
    return found ? { referenceID: found.referenceID, type: found.type } : null;
  };
  

  // Load data on component mount
  useEffect(() => {
    const loadData = () => {
      const newAreas = {
        STAGING_AREA: [],
        STACKING_AREA: [],
        GENERAL_AREA: [],
        OTHER_AREA: []
      };

      DFX3.forEach(item => {
        const entry = {
          location: item.LOCATION,
          referenceID: item.REFERENCEID,
          type: item.TYPE
        };

        switch(item.TYPE) {
          case "STACKING_AREA":
            newAreas.STACKING_AREA.push(entry);
            break;
          case "STAGING_AREA":
            newAreas.STAGING_AREA.push(entry);
            break;
          case "GENERAL_AREA":
            newAreas.GENERAL_AREA.push(entry);
            break;
          default:
            newAreas.OTHER_AREA.push(entry);
        }
      });

      setAreas(newAreas);
    };

    loadData();
    searchInputRef.current?.focus();
  }, []);

  // Update suggestions when search term changes
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const allLocations = [
      ...areas.STAGING_AREA,
      ...areas.STACKING_AREA,
      ...areas.GENERAL_AREA,
      ...areas.OTHER_AREA
    ];

    const filtered = allLocations
      .filter(item => 
        item.location.toLowerCase().includes(searchTerm.toLowerCase())
      );

    setSuggestions(filtered);
  }, [searchTerm, areas]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle search submission
  const handleSearch = (e) => {
    e.preventDefault();
    setError(null);
    setShowSuggestions(false);

    try {
      const rangeMatch = searchTerm.match(/^([A-Z]+)(\d+)\s*-\s*([A-Z]+)(\d+)$/);
      let formattedInputs = [];
      
      if (rangeMatch && rangeMatch[1] === rangeMatch[3]) {
        const prefix = rangeMatch[1];
        const start = parseInt(rangeMatch[2], 10);
        const end = parseInt(rangeMatch[4], 10);
        
        if (start <= end) {
          formattedInputs = generateRange(prefix, start, end);
        } else {
          setError('Invalid range. Ensure start <= end.');
          return;
        }
      } else {
        formattedInputs = formatInput(searchTerm);
      }

      const newResults = [];

      formattedInputs.forEach(input => {
        const result = findReferenceId(input);
        if (result) {
          newResults.push({
            location: input,
            referenceId: result.referenceID,
            type: result.type
          });
        }
      });

      if (newResults.length === 0) {
        setError('No matching locations found');
        return;
      }

      setResults(newResults);
      setError(null);
      
      setTimeout(() => {
        if (resultsContainerRef.current) {
          resultsContainerRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);

    } catch (err) {
      setError('An error occurred while processing your request.');
      console.error(err);
    }
  };

  // Handle suggestion selection with delay
  const handleSuggestionSelect = (suggestion, e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      setTypingTimeout(null);
    }
    
    setShowSuggestions(false);
    setSearchTerm(suggestion.location);
    setError(null);
    
    const result = findReferenceId(suggestion.location);
    if (result) {
      setResults([{
        location: suggestion.location,
        referenceId: result.referenceID,
        type: result.type
      }]);
      setError(null);
      setTimeout(() => {
        if (resultsContainerRef.current) {
          resultsContainerRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  };

  // Handle selection from history list
  const handleHistorySelect = (historyItem) => {
    setSearchTerm(historyItem.location);
    setError(null);
    
    const result = findReferenceId(historyItem.location);
    if (result) {
        setResults([{
            location: historyItem.location,
            referenceId: result.referenceID,
            type: result.type
        }]);
        setError(null);
        setTimeout(() => resultsContainerRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } else {
        setError(`Location not found: ${historyItem.location}`);
        setResults([]);
    }
    setShowSuggestions(false);
  };

  // MODIFIED: Handle text detection from modular camera
  const handleCameraScanComplete = (scannedText, updateModalResult) => {
    setSearchTerm(scannedText); 

    const formattedInputs = formatInput(scannedText);
    let finalResult = null; 

    if (formattedInputs.length > 0) {
        const input = formattedInputs[0];
        const result = findReferenceId(input);
        
        if (result) {
            finalResult = {
                location: input,
                referenceId: result.referenceID,
                type: result.type
            };
        }
    }

    if (finalResult) {
        // 1. Update parent component's state (for main screen and history)
        setResults([finalResult]);
        setError(null);
        
        setScanHistory(prevHistory => {
          const newEntry = {
            location: finalResult.location, 
            type: finalResult.type,
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          };
          const filteredHistory = prevHistory.filter(item => item.location !== newEntry.location);
          return [newEntry, ...filteredHistory].slice(0, 10);
        });
        
        // 2. AUTOMATICALLY CLOSE THE MODAL 
        setShowModularCamera(false); 
        
        // 3. Clear the modular camera's result state (cleanup is good practice)
        updateModalResult(null); 
        
        // Scroll to results on the main page
        setTimeout(() => resultsContainerRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);

    } else {
        // Clear search results and modal result if not found
        setResults([]);
        // Update the modular camera's state to show no result
        updateModalResult(null);
    }
  };


  // Handle closing the modal camera
  const handleCloseModularCamera = () => {
    setShowModularCamera(false);
  };

  const handleClear = () => { 
    setSearchTerm('');
    setResults([]);
    setError(null);
    setShowSuggestions(false);
  };

  const handlePrint = () => { window.print(); };

  return (
    <div className="qr-generator-container">
      <header className="qr-generator-header">
        <h1>DFX3 Station Codes</h1>
        <p>Updated on 11/28/25 (by mvvlasc)</p>
        <QuickLinksDropdown />
      </header>

      {/* Render modular camera when needed */}
      {showModularCamera && (
        <ModularCamera 
          onScanComplete={handleCameraScanComplete}
          onClose={handleCloseModularCamera}
        />
      )}

      <div className="qr-generator-content">
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-input-container" ref={suggestionsRef}>
            <div className="input-with-scanner">
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  if (typingTimeout) {
                    clearTimeout(typingTimeout);
                  }
                  setTypingTimeout(setTimeout(() => {
                    if (e.target.value.trim()) {
                      setShowSuggestions(true);
                    }
                  }, 300));
                }}
                onFocus={() => {
                  if (searchTerm.trim() && !typingTimeout) {
                    setShowSuggestions(true);
                  }
                }}
                placeholder="A-23.3A, STG.H02, AX1 or AX1-AX100"
                className="search-input"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="clear-button"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            
            {showSuggestions && suggestions.length > 0 && (
              <div className="suggestions-dropdown">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={`${suggestion.location}-${index}`}
                    className="suggestion-item"
                    onClick={(e) => handleSuggestionSelect(suggestion, e)}
                  >
                    <div className="suggestion-location">{suggestion.location}</div>
                    <div className="suggestion-type" style={{ backgroundColor: getTypeColor(suggestion.type) }}>
                      {getTypeDisplayName(suggestion.type)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>

        {/* Scan History Display */}
        {scanHistory.length > 0 && (
            <div className="scan-history-container">
                <h3>Recent Scans (Tap to Search)</h3>
                <div className="history-list">
                    {scanHistory.map((item, index) => (
                        <button
                            key={item.location + index}
                            onClick={() => handleHistorySelect(item)}
                            className="history-item-button"
                            title={`Scanned at ${item.timestamp}`}
                        >
                            {item.location}
                            <span className="history-timestamp">{item.timestamp}</span>
                        </button>
                    ))}
                </div>
            </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {results.length > 0 && (
          <div ref={resultsContainerRef} className="results-container">
            <div className="results-header">
              <h2 className="results-title">Generated Codes ({results.length})</h2>
              <button onClick={handlePrint} className="print-button">
                Print QR Codes
              </button>
            </div>
            <div className="qr-codes-list">
              {results.map((result, index) => (
                <div key={`${result.location}-${index}`} className="qr-code-item">
                  <div className="qr-code-wrapper">
                    <QRCodeCanvas 
                      value={result.referenceId} 
                      size={160}
                      level="H"
                      includeMargin={true}
                      data-testid={result.location}
                    />
                  </div>
                  <div className="qr-code-details">
                    <div className="location">{result.location}</div>
                    <div className="type" style={{ color: getTypeColor(result.type) }}>
                      {getTypeDisplayName(result.type)}
                    </div>
                    <div className="reference-id">
                      <span className="label">Ref: </span>
                      {result.referenceId}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Button to open modular camera */}
        <button 
          className="open-modular-camera-button"
          onClick={() => setShowModularCamera(true)}
          disabled={!cameraSupported}
        >
          {cameraSupported ? 'Camera Text Scanner' : 'Camera Not Supported'}
        </button>
      </div>

      <style jsx>{`
        .qr-generator-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
          font-family: 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }
        
        .qr-generator-header {
          text-align: center;
          margin-bottom: 2rem;
          position: relative;
        }
        
        .qr-generator-header h1 {
          font-size: 2.5rem;
          color: #2c3e50;
          margin-bottom: 0.5rem;
        }

        .qr-generator-header p {
          color: #7f8c8d;
          margin-bottom: 1rem;
        }

        .open-modular-camera-button {
          margin-top: 1rem;
          padding: 1rem 1.5rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        }

        .open-modular-camera-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
        }
        
        .open-modular-camera-button:disabled {
            background: #95a5a6;
            cursor: not-allowed;
            opacity: 0.8;
            box-shadow: none;
        }

        /* Quick Links Styles */
        .quick-links-container {
          position: relative;
          display: inline-block;
          margin-top: 1rem;
        }
        
        .quick-links-button {
          padding: 0.5rem 1rem;
          background-color: #3498db;
          color: white;
          border: none;
          border-radius: 4px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .quick-links-button:hover {
          background-color: #2980b9;
        }
        
        .dropdown-arrow {
          font-size: 0.7rem;
          transition: transform 0.3s;
        }
        
        .dropdown-arrow.open {
          transform: rotate(180deg);
        }
        
        .quick-links-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          background: white;
          border: 1px solid #ddd;
          border-radius: 4px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2);
          z-index: 100;
          min-width: 200px;
          margin-top: 0.5rem;
        }
        
        .quick-link-item {
          padding: 0;
        }
        
        .quick-link-link {
          display: block;
          padding: 0.75rem 1rem;
          color: #2c3e50;
          text-decoration: none;
          transition: background-color 0.2s;
        }
        
        .quick-link-link:hover {
          background-color: #f5f5f5;
        }
        
        .search-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 2rem;
          position: relative;
        }
        
        .search-input-container {
          position: relative;
          width: 100%;
        }
        
        .input-with-scanner {
          position: relative;
          display: flex;
          gap: 0.5rem;
        }

        .search-input {
          flex: 1;
          padding: 1rem;
          font-size: 1rem;
          border: 2px solid #ddd;
          border-radius: 8px;
          transition: border-color 0.3s;
          padding-right: 2.5rem;
        }
        
        .search-input:focus {
          outline: none;
          border-color: #3498db;
          box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.2);
        }
        
        .clear-button {
          position: absolute;
          right: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          font-size: 1.5rem;
          color: #aaa;
          cursor: pointer;
          padding: 0.25rem;
        }
        
        .clear-button:hover {
          color: #777;
        }
        
        .suggestions-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          max-height: 300px;
          overflow-y: auto;
          background: white;
          border: 1px solid #ddd;
          border-radius: 0 0 8px 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          z-index: 100;
        }
        
        .suggestion-item {
          padding: 0.75rem 1rem;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background-color 0.2s;
        }
        
        .suggestion-item:hover {
          background-color: #f5f5f5;
        }
        
        .suggestion-location {
          font-weight: 600;
          color: #2c3e50;
          margin-right: 10px;
        }
        
        .suggestion-type {
          color: white;
          padding: 0.25rem 0.5rem;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: bold;
          white-space: nowrap;
        }
        
        .error-message {
          color: #e74c3c;
          background-color: #fadbd8;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          border-left: 4px solid #e74c3c;
        }

        /* Scan History Styles */
        .scan-history-container {
            margin-top: 1.5rem;
            padding: 1rem;
            border: 1px solid #eee;
            border-radius: 8px;
            background: #fdfdff;
        }

        .scan-history-container h3 {
            font-size: 1.1rem;
            color: #34495e;
            margin-top: 0;
            margin-bottom: 0.75rem;
            border-bottom: 1px solid #eee;
            padding-bottom: 0.5rem;
        }

        .history-list {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }

        .history-item-button {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 1rem;
            background-color: #ecf0f1;
            color: #2c3e50;
            border: 1px solid #ddd;
            border-radius: 20px;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 500;
            transition: all 0.2s;
        }

        .history-item-button:hover {
            background-color: #bdc3c7;
            border-color: #b0b0b0;
        }

        .history-timestamp {
            font-size: 0.75rem;
            color: #7f8c8d;
        }
        
        .results-container {
          margin-top: 2rem;
          animation: fadeIn 0.5s ease-out;
        }
        
        .results-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          padding-bottom: 0.5rem;
          border-bottom: 2px solid #eee;
          gap: 1rem;
        }
        
        .results-title {
          font-size: 1.5rem;
          color: #2c3e50;
          margin: 0;
          white-space: nowrap;
        }
        
        .print-button {
          padding: 0.5rem 1rem;
          background-color: #27ae60;
          color: white;
          border: none;
          border-radius: 4px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.3s;
        }
        
        .print-button:hover {
          background-color: #219653;
        }
        
        .qr-codes-list {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-height: 70vh;
          overflow-y: auto;
          padding: 1rem;
          border-radius: 8px;
          background: #f8f9fa;
        }
        
        .qr-code-item {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          background: white;
          border-radius: 8px;
          padding: 1rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .qr-code-wrapper {
          flex-shrink: 0;
        }
        
        .qr-code-details {
          flex-grow: 1;
          min-width: 0;
        }
        
        .location {
          font-weight: 600;
          font-size: 1.1rem;
          color: #2c3e50;
          margin-bottom: 0.25rem;
          word-break: break-all;
        }
        
        .type {
          font-weight: 600;
          font-size: 0.9rem;
          margin-bottom: 0.5rem;
        }
        
        .reference-id {
          font-size: 0.85rem;
          color: #7f8c8d;
          word-break: break-all;
        }
        
        .label {
          font-weight: 600;
          color: #34495e;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @media (max-width: 768px) {
          .qr-generator-container {
            padding: 1rem;
          }
          
          .qr-generator-header h1 {
            font-size: 2rem;
          }
          
          .input-with-scanner {
            flex-direction: column;
          }
          
          .qr-code-item {
            flex-direction: column;
            gap: 1rem;
          }
          
          .qr-codes-list {
            max-height: 60vh;
          }
          
          .results-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }
        }
      `}</style>
    </div>
  );
};

export default QRCodeGenerator;