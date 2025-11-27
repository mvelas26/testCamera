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
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(true);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  
  const searchInputRef = useRef(null);
  const resultsContainerRef = useRef(null);
  const suggestionsRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const captureIntervalRef = useRef(null);
  const fileInputRef = useRef(null);

  // Use refs for state that shouldn't trigger re-renders
  const camerasRef = useRef([]);
  const selectedCameraRef = useRef('');

  // Initialize areas data with type information
  const [areas, setAreas] = useState({
    STAGING_AREA: [],
    STACKING_AREA: [],
    GENERAL_AREA: [],
    OTHER_AREA: []
  });

  // Check camera support on component mount
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
      // First check if it's a range that shouldn't be transformed
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
    
    // Clear any pending timeout
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

  // Text Scanner Component
  const TextScanner = () => {
    const [isLoadingCameras, setIsLoadingCameras] = useState(false);
    const [availableCameras, setAvailableCameras] = useState([]);
    const [selectedCamera, setSelectedCamera] = useState('');

    // Get available cameras
    const getCameras = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) {
        return [];
      }

      try {
        setIsLoadingCameras(true);
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        console.log('Found cameras:', videoDevices);
        
        const camerasList = videoDevices.map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${videoDevices.indexOf(device) + 1}`
        }));
        
        setAvailableCameras(camerasList);
        camerasRef.current = camerasList;
        
        if (camerasList.length > 0 && !selectedCamera) {
          setSelectedCamera(camerasList[0].deviceId);
          selectedCameraRef.current = camerasList[0].deviceId;
        }
        return camerasList;
      } catch (err) {
        console.error('Error getting cameras:', err);
        return [];
      } finally {
        setIsLoadingCameras(false);
      }
    };

    const startCamera = async () => {
      try {
        setError(null);
        setIsLoadingCameras(true);

        console.log('Starting camera...');
        
        // Stop any existing camera first
        if (streamRef.current) {
          console.log('Stopping existing camera...');
          stopCamera();
          // Wait a bit for camera to fully release
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Simple constraints
        const constraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } 
        };

        // If we have a specific camera selected, use it
        const currentSelectedCamera = selectedCamera || selectedCameraRef.current;
        if (currentSelectedCamera && availableCameras.length > 0) {
          constraints.video.deviceId = { exact: currentSelectedCamera };
        }

        console.log('Camera constraints:', constraints);

        // Get the stream
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        console.log('Camera stream obtained:', stream);
        console.log('Stream active:', stream.active);
        console.log('Stream tracks:', stream.getTracks().map(t => ({kind: t.kind, readyState: t.readyState})));
        
        // Store the stream reference IMMEDIATELY
        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          
          // Set up event listeners for the video element
          const onLoaded = () => {
            console.log('Video metadata loaded, playing...');
            videoRef.current.play().then(() => {
              console.log('Video playing successfully');
              console.log('Video readyState:', videoRef.current.readyState);
              console.log('Video dimensions:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight);
              
              // Update video dimensions for debugging
              setVideoDimensions({
                width: videoRef.current.videoWidth,
                height: videoRef.current.videoHeight
              });
              
              setIsScanning(true);
              setIsLoadingCameras(false);
              
              // Start OCR capturing after video is playing
              startOCRCapturing();
            }).catch(err => {
              console.error('Error playing video:', err);
              setError('Error starting camera: ' + err.message);
              setIsLoadingCameras(false);
              stopCamera();
            });
          };

          const onError = (err) => {
            console.error('Video error:', err);
            setError('Camera error: ' + err);
            setIsLoadingCameras(false);
            stopCamera();
          };

          videoRef.current.onloadedmetadata = onLoaded;
          videoRef.current.onerror = onError;

          // If already loaded, trigger manually
          if (videoRef.current.readyState >= 1) {
            onLoaded();
          }
        } else {
          // If no video element, still proceed
          setIsScanning(true);
          setIsLoadingCameras(false);
          startOCRCapturing();
        }
        
      } catch (err) {
        console.error('Camera start error:', err);
        setIsLoadingCameras(false);
        
        let errorMessage = 'Cannot access camera: ';
        
        if (err.name === 'NotAllowedError') {
          errorMessage = 'Camera permission denied. Please allow camera access in your browser settings.';
        } else if (err.name === 'NotFoundError') {
          errorMessage = 'No camera found on this device.';
        } else if (err.name === 'NotSupportedError') {
          errorMessage = 'Camera not supported in this browser.';
        } else if (err.name === 'NotReadableError') {
          errorMessage = 'Camera is already in use by another application.';
        } else if (err.name === 'OverconstrainedError') {
          errorMessage = 'Camera constraints cannot be met. Trying default settings...';
          // Try again with no constraints
          setTimeout(() => startCameraWithDefault(), 100);
          return;
        } else {
          errorMessage += err.message;
        }
        
        setError(errorMessage);
      }
    };

    // Fallback with minimal constraints
    const startCameraWithDefault = async () => {
      try {
        console.log('Trying camera with default constraints...');
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play().then(() => {
              setIsScanning(true);
              startOCRCapturing();
            });
          };
        }
      } catch (err) {
        console.error('Default camera failed:', err);
        setError('Cannot access camera even with default settings: ' + err.message);
      }
    };

    const stopCamera = () => {
      console.log('Stopping camera...');
      
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        console.log('Stopping tracks:', tracks);
        
        tracks.forEach(track => {
          console.log('Stopping track:', track.kind, 'state:', track.readyState);
          track.stop();
        });
        streamRef.current = null;
      }
      
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
      
      setIsScanning(false);
      setIsProcessing(false);
      
      // Clear video element
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        // Remove event listeners
        videoRef.current.onloadedmetadata = null;
        videoRef.current.onerror = null;
      }
      
      console.log('Camera stopped');
    };

    const startOCRCapturing = () => {
      console.log('Starting OCR capturing...');
      
      // Clear any existing interval
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
      
      captureIntervalRef.current = setInterval(() => {
        const currentStream = streamRef.current;
        const video = videoRef.current;
        
        if (!currentStream || !video) {
          return;
        }
        
        // Check if stream is still active
        if (!currentStream.active) {
          console.log('Stream is not active, stopping camera');
          stopCamera();
          return;
        }
        
        // Check if video is ready
        if (video.readyState === video.HAVE_ENOUGH_DATA && !isProcessing) {
          captureAndProcessFrame();
        }
      }, 3000);
    };

    const captureAndProcessFrame = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const currentStream = streamRef.current;
      
      if (!video || !canvas || !currentStream) {
        console.log('Skipping frame capture - video, canvas, or stream not ready');
        return;
      }

      // Check if video stream is still active
      if (!currentStream.active) {
        console.log('Stream not active, stopping camera');
        stopCamera();
        return;
      }

      const activeTracks = currentStream.getTracks().filter(track => track.readyState === 'live');
      if (activeTracks.length === 0) {
        console.log('No active video tracks, stopping camera');
        stopCamera();
        return;
      }

      // Check if video has valid dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.log('Video has zero dimensions, skipping capture');
        return;
      }

      setIsProcessing(true);
      
      try {
        console.log('Capturing frame for OCR...');
        
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        console.log('Processing OCR...');
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
          }
        }
      } catch (err) {
        console.error('OCR processing error:', err);
        setError('OCR processing failed: ' + err.message);
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
        /([A-Z])(\d+)(\d+)([A-Z])/
      ];
      
      for (const pattern of patterns) {
        const match = cleanedText.match(pattern);
        if (match) {
          const [, letter, firstNum, secondNum, endingLetter] = match;
          return `${letter}-${firstNum}.${secondNum}${endingLetter}`;
        }
      }
      
      const locationPattern = /[A-Z]-?\d+\.?\d*[A-Z]?/;
      const locationMatch = cleanedText.match(locationPattern);
      if (locationMatch) {
        return locationMatch[0];
      }
      
      return null;
    };

    const handleScannedText = (scannedText) => {
      console.log('Processed scanned text:', scannedText);
      setSearchTerm(scannedText);
      
      // Auto-search but keep camera running
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
        console.log('Cannot capture - scanning:', isScanning, 'processing:', isProcessing, 'stream:', !!streamRef.current);
        return;
      }
      console.log('Manual capture triggered');
      captureAndProcessFrame();
    };

    const handleImageUpload = (event) => {
      const file = event.target.files[0];
      if (!file) {
        console.log('No file selected');
        return;
      }

      console.log('File selected:', file.name, file.type, file.size);

      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }

      const reader = new FileReader();
      
      reader.onloadstart = () => {
        setIsProcessing(true);
        console.log('Starting file read...');
      };

      reader.onload = (e) => {
        console.log('File read successfully');
        try {
          const image = new Image();
          image.onload = async () => {
            try {
              console.log('Image loaded, dimensions:', image.width, 'x', image.height);
              const canvas = canvasRef.current;
              if (!canvas) {
                throw new Error('Canvas not available');
              }
              
              const context = canvas.getContext('2d');
              canvas.width = image.width;
              canvas.height = image.height;
              context.drawImage(image, 0, 0);

              console.log('Processing image with OCR...');
              const { data: { text } } = await Tesseract.recognize(
                canvas,
                'eng',
                { 
                  tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- .'
                }
              );

              console.log('Uploaded Image OCR Result:', text);
              
              if (text && text.trim()) {
                const processedText = processOCRText(text);
                if (processedText) {
                  setSearchTerm(processedText);
                  handleSearchFromScan(processedText);
                } else {
                  setError('No location text found in the image. Please try another image.');
                }
              } else {
                setError('No text found in the image. Please try another image.');
              }
            } catch (err) {
              console.error('OCR processing error:', err);
              setError('Error processing image: ' + err.message);
            } finally {
              setIsProcessing(false);
            }
          };
          
          image.onerror = () => {
            console.error('Error loading image');
            setError('Error loading image file');
            setIsProcessing(false);
          };
          
          image.src = e.target.result;
        } catch (err) {
          console.error('Image processing error:', err);
          setError('Error processing image: ' + err.message);
          setIsProcessing(false);
        }
      };

      reader.onerror = (err) => {
        console.error('FileReader error:', err);
        setError('Error reading file: ' + err);
        setIsProcessing(false);
      };

      reader.onabort = () => {
        console.log('File read aborted');
        setIsProcessing(false);
      };

      // Use readAsDataURL instead of readAsArrayBuffer to fix the error
      reader.readAsDataURL(file);
      event.target.value = '';
    };

    const switchCamera = async (deviceId) => {
      setSelectedCamera(deviceId);
      selectedCameraRef.current = deviceId;
      if (isScanning) {
        stopCamera();
        // Wait for camera to fully stop before starting new one
        setTimeout(() => startCamera(), 1000);
      }
    };

    // Load cameras on component mount
    useEffect(() => {
      getCameras();
    }, []);

    return (
      <div className="text-scanner">
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
              </>
            ) : (
              <div className="camera-not-supported">
                <p>Camera not supported in this environment</p>
              </div>
            )}
            
            <div className="upload-option">
              <p>Or upload an image:</p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="file-input"
              />
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="upload-button"
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : '📁 Upload Image'}
              </button>
            </div>
          </div>
        ) : (
          <div className="scanner-container">
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
            <div className="video-wrapper">
              <video 
                ref={videoRef}
                autoPlay 
                playsInline
                muted
                className="camera-video"
              />
              <canvas 
                ref={canvasRef} 
                style={{ display: 'none' }}
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
            <div className="scanner-status">
              <p>✅ Camera is running • Auto-scanning every 3 seconds</p>
              <p className="video-debug">
                Video: {videoDimensions.width}x{videoDimensions.height} • 
                ReadyState: {videoRef.current?.readyState || 'N/A'} • 
                Stream: {streamRef.current?.active ? 'Active' : 'Inactive'}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const handlePrint = () => {
    if (results.length === 0) return;
    
    const printWindow = window.open('', '_blank');
    const isSingle = results.length === 1;
  
    const renderHighQualityQR = (result, size) => {
      const canvas = document.createElement('canvas');
      canvas.width = size * 2;
      canvas.height = size * 2;
      const ctx = canvas.getContext('2d');
      
      const tempDiv = document.createElement('div');
      document.body.appendChild(tempDiv);
      ReactDOM.render(
        <QRCodeCanvas 
          value={result.referenceId}
          size={size * 2}
          level="H"
          includeMargin={true}
          data-testid={result.location}
        />,
        tempDiv
      );
  
      return new Promise(resolve => {
        setTimeout(() => {
          const qrCanvas = tempDiv.querySelector('canvas');
          if (qrCanvas) {
            ctx.drawImage(qrCanvas, 0, 0, size * 2, size * 2);
            const dataUrl = canvas.toDataURL('image/png', 1.0);
            ReactDOM.unmountComponentAtNode(tempDiv);
            document.body.removeChild(tempDiv);
            resolve(dataUrl);
          } else {
            resolve('');
          }
        }, 100);
      });
    };
  
    Promise.all(
      results.map(result => 
        renderHighQualityQR(result, isSingle ? 500 : 160)
      )
    ).then(qrDataUrls => {
      const validQrDataUrls = qrDataUrls.filter(url => url !== '');
      
      printWindow.document.write(`
  <html>
    <head>
      <title>QR Codes</title>
      <style>
        ${isSingle ? `
          @page { 
            size: A4 portrait;
            margin: 0;
          }
          body { 
            font-family: Arial, sans-serif; 
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
          }
          .print-page {
            text-align: center;
            max-width: 100%;
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
          }
          .qr-container {
            border: 1px solid #eee;
            padding: 20px;
          }
          .print-location { 
            font-size: 48px;
            font-weight: bold; 
            margin: 30px 0 15px; 
          }
          .print-reference { 
            font-size: 32px;
            color: #555;
            margin-top: 15px;
            word-break: break-all;
            max-width: 80%;
            margin-left: auto;
            margin-right: auto;
          }
          .qr-image {
            width: 500px;
            height: 500px;
          }
          @media print {
            body {
              padding: 0;
            }
          }
        ` : `
          @page { size: auto; margin: 0; }
          body { 
            font-family: Arial, sans-serif; 
            padding: 20px; 
          }
          .print-container { 
            display: grid; 
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); 
            gap: 20px; 
          }
          .print-item { 
            text-align: center; 
            page-break-inside: avoid; 
            margin-bottom: 20px; 
          }
          .print-location { 
            font-weight: bold; 
            margin: 10px 0 5px; 
          }
          .qr-border {
            display: inline-block; 
            border: 1px solid #eee; 
            padding: 10px;
          }
          @media print {
            body { padding: 0; }
            .print-item { margin-bottom: 0; }
          }
        `}
      </style>
    </head>
    <body>
      ${isSingle ? `
        <div class="print-page">
          <div class="qr-container">
            <img class="qr-image" src="${validQrDataUrls[0]}" />
          </div>
          <div class="print-location">${results[0].location}</div>
          ${results[0].referenceId ? `
            <div class="print-reference">${results[0].referenceId}</div>
          ` : ''}
        </div>
      ` : `
        <div class="print-container">
          ${results.map((result, index) => `
            <div class="print-item">
              <div class="qr-border">
                <img src="${validQrDataUrls[index]}" width="160" height="160" />
              </div>
              <div class="print-location">${result.location}</div>
            </div>
          `).join('')}
        </div>
      `}
      <script>
        setTimeout(() => {
          window.print();
          window.close();
        }, 200);
      </script>
    </body>
  </html>
`);
      printWindow.document.close();
    }).catch(err => {
      console.error('Print error:', err);
      setError('Error generating print preview: ' + err.message);
    });
  };

  // Handle clear action
  const handleClear = () => {
    setSearchTerm('');
    setResults([]);
    setError(null);
    setShowSuggestions(false);
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      setTypingTimeout(null);
    }
    searchInputRef.current?.focus();
  };

  // Get display name for area type
  const getTypeDisplayName = (type) => {
    switch(type) {
      case "STACKING_AREA": return "Stacking";
      case "STAGING_AREA": return "Staging";
      case "GENERAL_AREA": return "General";
      default: return "Other";
    }
  };

  // Get color for type badge
  const getTypeColor = (type) => {
    switch(type) {
      case "STACKING_AREA": return "#3498db";
      case "STAGING_AREA": return "#2ecc71";
      case "GENERAL_AREA": return "#9b59b6";
      default: return "#e74c3c";
    }
  };

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        console.log('Cleaning up camera on main component unmount');
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
    };
  }, []);

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

        .scan-button:hover:not(:disabled) {
          background-color: #7d3c98;
        }

        .scan-button:disabled {
          background-color: #95a5a6;
          cursor: not-allowed;
        }

        .camera-not-supported {
          padding: 1rem;
          background-color: #f8d7da;
          color: #721c24;
          border-radius: 8px;
          text-align: center;
        }

        .upload-option {
          text-align: center;
          padding: 1rem;
          border: 2px dashed #ddd;
          border-radius: 8px;
        }

        .upload-option p {
          margin: 0 0 0.5rem 0;
          color: #666;
        }

        .file-input {
          display: none;
        }

        .upload-button {
          padding: 0.75rem 1.5rem;
          background-color: #3498db;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 0.9rem;
          cursor: pointer;
          transition: background-color 0.3s;
        }

        .upload-button:hover:not(:disabled) {
          background-color: #2980b9;
        }

        .upload-button:disabled {
          background-color: #95a5a6;
          cursor: not-allowed;
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

        /* FIXED CAMERA VIDEO STYLES - SIMPLIFIED */
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