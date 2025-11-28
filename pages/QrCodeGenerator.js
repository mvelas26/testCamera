import { useState, useEffect, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import ReactDOM from 'react-dom';
import DFX3 from 'Resources/DFX3.json';
import Tesseract from 'tesseract.js';

const QRCodeGenerator = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState(null);
  
  const searchInputRef = useRef(null);
  const resultsContainerRef = useRef(null);
  const suggestionsRef = useRef(null);
  // Removed: fileInputRef
  
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

  // Generate all locations in a range
  const generateRange = (prefix, start, end) => {
    const locations = [];
    for (let i = start; i <= end; i++) {
      locations.push(`${prefix}${i}`);
    }
    return locations;
  };

  // Format input according to business rules
  const formatInput = (value) => {
    if (!value) return [];
    
    value = value.toUpperCase().trim();

    // Handle ranges first (they shouldn't be transformed)
    const rangeMatch = value.match(/^([A-Z]+)(\d+)\s*-\s*([A-Z]+)(\d+)$/);
    if (rangeMatch && rangeMatch[1] === rangeMatch[3]) {
      const prefix = rangeMatch[1];
      const start = parseInt(rangeMatch[2], 10);
      const end = parseInt(rangeMatch[4], 10);
      
      if (start <= end) {
        return generateRange(prefix, start, end);
      }
      return [value]; // Return original if invalid range
    }

    // New transformation for patterns like a233a, b11a, z344e
    const patternMatch = value.match(/^([A-Z])(\d{1,2})(\d)([A-Z])$/);
    if (patternMatch) {
      const [, letter, firstDigits, lastDigit, endingLetter] = patternMatch;
      return [`${letter}-${firstDigits}.${lastDigit}${endingLetter}`];
    }

    // Handle single values
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

  // Find reference ID for a location
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

  // Text Scanner Component - CLEANED VERSION
  const TextScanner = () => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const captureIntervalRef = useRef(null);

    const [isScanning, setIsScanning] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isLoadingCameras, setIsLoadingCameras] = useState(false);
    const [availableCameras, setAvailableCameras] = useState([]);
    const [selectedCamera, setSelectedCamera] = useState('');
    const [cameraError, setCameraError] = useState('');
    const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });

    const camerasRef = useRef([]);
    const selectedCameraRef = useRef('');
    
    // Get available cameras (logic remains the same)
    const getCameras = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) {
        return [];
      }

      try {
        setIsLoadingCameras(true);
        // Request camera access to populate the device list labels
        await navigator.mediaDevices.getUserMedia({ video: true, audio: false });

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        const camerasList = videoDevices.map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${videoDevices.indexOf(device) + 1}`
        }));
        
        setAvailableCameras(camerasList);
        camerasRef.current = camerasList;
        
        if (camerasList.length > 0 && !selectedCamera) {
          const backCamera = camerasList.find(c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('environment')) || camerasList[0];
          setSelectedCamera(backCamera.deviceId);
          selectedCameraRef.current = backCamera.deviceId;
        }
        return camerasList;
      } catch (err) {
        console.warn("Could not enumerate cameras, continuing with default access.", err);
        return [];
      } finally {
        setIsLoadingCameras(false);
      }
    };

    const stopCamera = () => {
      console.log('Stopping camera...');
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
      
      setIsScanning(false);
      setIsProcessing(false);
      setCameraError('');
      setVideoDimensions({ width: 0, height: 0 });
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
    
    // Cleanup on unmount
    useEffect(() => {
        getCameras();
        return () => stopCamera();
    }, []);


    const startCamera = async () => {
      try {
        setError(null);
        setCameraError('');
        setIsLoadingCameras(true);

        stopCamera(); 
        await new Promise(resolve => setTimeout(resolve, 300)); // Allow previous stream to release

        if (!videoRef.current || !canvasRef.current) {
          setCameraError('Camera elements not ready. Please try again.');
          setIsLoadingCameras(false);
          return;
        }

        const constraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'environment' // Prefer rear camera by default
          } 
        };

        const currentSelectedCamera = selectedCamera || selectedCameraRef.current;
        if (currentSelectedCamera && availableCameras.length > 0) {
          constraints.video.deviceId = { exact: currentSelectedCamera };
          // If a specific device is selected, don't use facingMode as it can conflict
          delete constraints.video.facingMode;
        }

        // 1. Get the stream
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        console.log('Step 1: Successfully acquired camera stream.');
        
        // 2. Attach stream to the video element
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        const video = videoRef.current;
        
        // 3. Robust Playback Logic
        const attemptPlay = () => {
            if (video.readyState >= 1) { 
                console.log('Step 3a: Attempting video.play()...');
                video.play().then(() => {
                    // SUCCESS PATH
                    console.log('Step 3b: Video playing successfully.'); 
                    setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
                    
                    setIsScanning(true);
                    setIsLoadingCameras(false);
                    startOCRCapturing();
                    
                }).catch(err => {
                    // FAILURE PATH: Autoplay Blocked or Other Playback Error
                    console.error('Step 3c: Video Playback Error:', err);
                    setCameraError('Video failed to play. Check browser security settings.');
                    stopCamera();
                });
            } else {
                // Wait for metadata
                video.onloadedmetadata = () => {
                     attemptPlay(); 
                     video.onloadedmetadata = null; 
                };
            }
        };

        attemptPlay();

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
        } else {
          errorMessage += err.message;
        }
        
        setCameraError(errorMessage);
        setError(errorMessage);
      }
    };

    const startOCRCapturing = () => {
      console.log('Starting OCR capturing...');
      
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
      
      captureIntervalRef.current = setInterval(() => {
        if (!streamRef.current || !videoRef.current || isProcessing) {
          return;
        }
        
        if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
          captureAndProcessFrame();
        }
      }, 3000);
    };

    const captureAndProcessFrame = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (isProcessing || !video || !canvas || !streamRef.current || video.videoWidth === 0) {
        return;
      }

      setIsProcessing(true);
      
      try {
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const { data: { text } } = await Tesseract.recognize(
          canvas,
          'eng',
          { 
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- .'
          }
        );

        console.log('OCR Result:', text);
        
        if (text && text.trim()) {
          const processedText = processOCRText(text);
          if (processedText) {
            console.log('Found location:', processedText);
            handleScannedText(processedText);
            stopCamera(); // Stop camera once a valid result is found
          }
        }
      } catch (err) {
        console.error('OCR processing error:', err);
      } finally {
        setIsProcessing(false);
      }
    };

    const processOCRText = (text) => {
      let cleanedText = text.trim()
        .replace(/\s+/g, ' ')
        .toUpperCase();
      
      // Complex patterns (e.g., A-17 1B)
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
          // Re-assemble into standard format X-NN.NX
          const [, letter, firstNum, secondNum, endingLetter] = match;
          const result = `${letter}-${firstNum.replace(/-/g, '')}.${secondNum}${endingLetter}`;
          return result;
        }
      }
      
      // Simple patterns (e.g., STG.H02, A-17.1B)
      const locationPattern = /[A-Z]-?\d+\.?\d*[A-Z]?|STG\.[A-Z]\d{2,3}/;
      const locationMatch = cleanedText.match(locationPattern);
      if (locationMatch) {
        return locationMatch[0];
      }
      
      return null;
    };

    const handleScannedText = (scannedText) => {
      setSearchTerm(scannedText);
      setTimeout(() => {
        handleSearchFromScan(scannedText);
      }, 100);
    };

    const handleSearchFromScan = (scannedText) => {
      setError(null);
      const formattedInputs = formatInput(scannedText);
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
        setError(`No matching locations found for: ${scannedText}`);
        return;
      }

      setResults(newResults);
      setError(null);
    };

    const captureManual = () => {
      if (!isScanning || isProcessing || !streamRef.current) {
        return;
      }
      captureAndProcessFrame();
    };

    const switchCamera = async (deviceId) => {
      setSelectedCamera(deviceId);
      selectedCameraRef.current = deviceId;
      if (isScanning) {
        stopCamera();
        // Give the camera a moment to stop before starting again
        setTimeout(() => startCamera(), 500);
      }
    };

    return (
      <div className="text-scanner">
        
        {/* CANVAS IS ALWAYS RENDERED, ALWAYS HIDDEN */}
        <div style={{ display: 'none' }}>
          <canvas ref={canvasRef} /> 
        </div>

        {/* Video container visibility controlled by isScanning state */}
        <div className={`scanner-container ${isScanning ? 'is-scanning' : 'is-hidden'}`}>
          <div className="scanner-header">
            <h3>✅ Camera Active</h3>
            <div className="scanner-controls">
              {availableCameras.length > 1 && (
                <select 
                  value={selectedCamera}
                  onChange={(e) => switchCamera(e.target.value)}
                  className="camera-switcher"
                >
                  {availableCameras.map(camera => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label}
                    </option>
                  ))}
                </select>
              )}
              <button 
                type="button" 
                onClick={captureManual}
                className="capture-button"
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : '📸 Capture Now'}
              </button>
              <button 
                type="button" 
                onClick={stopCamera}
                className="stop-scan-button"
              >
                ✕ Stop Camera
              </button>
            </div>
          </div>
          
          <div className="video-display-container">
            <div className="video-wrapper">
              <video 
                ref={videoRef} // ALWAYS attached
                srcObject={streamRef.current}
                autoPlay 
                playsInline
                muted
                className="camera-video"
                key="camera-display" 
              />
              <div className="scan-overlay">
                <div className="scan-frame">
                  <div className="scan-corner top-left"></div>
                  <div className="scan-corner top-right"></div>
                  <div className="scan-corner bottom-left"></div>
                  <div className="scan-corner bottom-right"></div>
                </div>
                <p>Point camera at location text</p>
                <p className="scan-hint">e.g., "B-17 1B" → "B-17.1B"</p>
                {isProcessing && (
                  <div className="processing-indicator">
                    <div className="spinner"></div>
                    Reading text...
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="scanner-status">
            <p>✅ Camera is running • Auto-scanning every 3 seconds</p>
            <p className="video-debug">
              Video: {videoDimensions.width}x{videoDimensions.height} • 
              Stream: {streamRef.current?.active ? 'Active' : 'Inactive'}
            </p>
          </div>
        </div>
        
        {/* START BUTTONS ARE DISPLAYED CONDITIONAL TO IS_SCANNING STATE */}
        {!isScanning ? (
          <div className="scan-options">
            {cameraSupported ? (
              <>
                <div className="camera-selection">
                  <label htmlFor="camera-select">Select Camera:</label>
                  <select 
                    id="camera-select"
                    value={selectedCamera}
                    onChange={(e) => switchCamera(e.target.value)}
                    disabled={isLoadingCameras}
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
                <button 
                  type="button" 
                  onClick={startCamera}
                  className="scan-button"
                  disabled={isLoadingCameras}
                >
                  {isLoadingCameras ? 'Starting Camera...' : '📷 Scan with Camera'}
                </button>
                {cameraError && (
                  <div className="camera-error-message">
                    {cameraError}
                  </div>
                )}
              </>
            ) : (
              <div className="camera-not-supported">
                <p>Camera not supported in this environment</p>
              </div>
            )}
            
            {/* Removed: Image Upload Option */}
          </div>
        ) : null}
      </div>
    );
  };
  
  // The rest of the QRCodeGenerator methods (handlePrint, handleClear, getTypeDisplayName, getTypeColor) 
  // are assumed to be outside of this TextScanner block, but remain unchanged.

  const handlePrint = () => { /* ... (Your implementation here) ... */ };
  const handleClear = () => { /* ... (Your implementation here) ... */ };
  const getTypeDisplayName = (type) => { /* ... (Your implementation here) ... */ };
  const getTypeColor = (type) => { /* ... (Your implementation here) ... */ };


  return (
    <div className="qr-generator-container">
      <header className="qr-generator-header">
        <h1>DFX3 Station Codes</h1>
        <p>Updated on 4/20/25 (by mvvlasc)</p>
        <QuickLinksDropdown />
      </header>

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
            
            {/* Text Scanner */}
            <TextScanner />
            
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
      </div>

      <style jsx>{`
        /* 🛑 NEW CSS FOR THE CAMERA FIX 🛑 */
        .scanner-container.is-hidden {
          display: none;
        }

        .scanner-container.is-scanning {
          display: block;
        }
        /* 🛑 END NEW CSS 🛑 */

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
        
        /* Text Scanner Styles */
        .text-scanner {
          margin-top: 1rem;
        }

        .scan-options {
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
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: white;
        }

        .scan-button {
          width: 100%;
          padding: 1rem;
          background-color: #8e44ad;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.3s;
        }

        .scan-button:hover:not(.scan-button:disabled) {
          background-color: #7d3c98;
        }

        .scan-button:disabled {
          background-color: #95a5a6;
          cursor: not-allowed;
        }

        .camera-error-message {
          color: #e74c3c;
          background-color: #fadbd8;
          padding: 0.75rem;
          border-radius: 4px;
          border-left: 4px solid #e74c3c;
          font-size: 0.9rem;
          margin-top: 0.5rem;
        }

        .camera-not-supported {
          padding: 1rem;
          background-color: #f8d7da;
          color: #721c24;
          border-radius: 8px;
          text-align: center;
        }

        .scanner-container {
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        .scanner-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background-color: #34495e;
          color: white;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .scanner-header h3 {
          margin: 0;
          font-size: 1.1rem;
        }

        .scanner-controls {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .camera-switcher {
          padding: 0.25rem 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: white;
          color: #2c3e50;
          font-size: 0.8rem;
        }

        .capture-button {
          padding: 0.5rem 1rem;
          background-color: #27ae60;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.9rem;
        }

        .capture-button:disabled {
          background-color: #95a5a6;
          cursor: not-allowed;
        }

        .stop-scan-button {
          padding: 0.5rem 1rem;
          background-color: #e74c3c;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.9rem;
        }

        .stop-scan-button:hover {
          background-color: #c0392b;
        }

        /* VIDEO DISPLAY */
        .video-display-container {
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 8px;
          margin: 1rem;
        }

        .video-wrapper {
          position: relative;
          width: 100%;
          max-width: 500px;
          margin: 0 auto;
          background: #000;
          border-radius: 8px;
          overflow: hidden;
          min-height: 400px;
        }

        .camera-video {
          width: 100%;
          height: 400px;
          display: block;
          background: #000;
          object-fit: cover;
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

        .scan-hint {
          font-size: 0.9rem;
          opacity: 0.8;
          margin-top: 0.5rem;
        }

        .processing-indicator {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 1rem;
          padding: 0.5rem 1rem;
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

        .scanner-status {
          padding: 0.5rem 1rem;
          background-color: #d4edda;
          color: #155724;
          text-align: center;
          border-top: 1px solid #c3e6cb;
        }

        .video-debug {
          font-size: 0.8rem;
          opacity: 0.7;
          margin: 0.25rem 0 0 0;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
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
          
          .scanner-header {
            flex-direction: column;
            gap: 1rem;
            text-align: center;
          }
          
          .scanner-controls {
            width: 100%;
            justify-content: center;
          }
          
          .camera-switcher {
            width: 100%;
            margin-bottom: 0.5rem;
          }
          
          .camera-video {
            height: 300px;
          }
          
          .video-wrapper {
            min-height: 300px;
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