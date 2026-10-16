/**
 * Client Security & Telemetry Engine
 * Harvests high-entropy OS version, CPU architecture, bitness, VM detection,
 * and client network GeoIP / proxy status for proctored examinations.
 */

export async function getHighEntropyOsMetadata() {
  const ua = navigator.userAgent || '';
  let osFamily = 'Unknown OS';
  let osVersion = 'Unknown Version';
  let architecture = 'x86_64';
  let bitness = '64';
  let platformVersion = '';
  let model = '';

  // 1. High-Entropy User-Agent Client Hints (Chromium 90+, Edge, Opera, Brave)
  if (navigator.userAgentData && typeof navigator.userAgentData.getHighEntropyValues === 'function') {
    try {
      const hints = await navigator.userAgentData.getHighEntropyValues([
        'platform',
        'platformVersion',
        'architecture',
        'bitness',
        'model',
        'uaFullVersion'
      ]);

      if (hints.platform) osFamily = hints.platform;
      if (hints.architecture) {
        architecture = (hints.architecture === 'x86' && hints.bitness === '64') ? 'x86_64' : hints.architecture;
      }
      if (hints.bitness) bitness = hints.bitness;
      if (hints.model) model = hints.model;

      if (hints.platformVersion) {
        platformVersion = hints.platformVersion;
        const majorVersion = parseInt(hints.platformVersion.split('.')[0], 10);
        if (hints.platform === 'Windows') {
          // In Chromium on Windows:
          // Major version >= 13 maps to Windows 11 (Windows NT build >= 22000)
          // Major version 1..10 maps to Windows 10
          if (majorVersion >= 13) {
            osVersion = `Windows 11 (Build ${hints.platformVersion})`;
          } else if (majorVersion >= 1) {
            osVersion = `Windows 10 (Build ${hints.platformVersion})`;
          } else {
            osVersion = `Windows (Build ${hints.platformVersion})`;
          }
        } else if (hints.platform === 'macOS') {
          osVersion = `macOS (Release ${hints.platformVersion})`;
        } else if (hints.platform === 'Chrome OS' || hints.platform === 'Chromium OS') {
          osVersion = `ChromeOS (Build ${hints.platformVersion})`;
        } else {
          osVersion = `${hints.platform} ${hints.platformVersion}`;
        }
      }
    } catch (e) {
      console.warn("[SECURITY_TELEMETRY]: UserAgentData hints notice:", e);
    }
  }

  // 2. Fallback heuristic detection if Client Hints were not supported or unresolved
  if (osVersion === 'Unknown Version') {
    if (ua.includes('Win')) {
      osFamily = 'Windows';
      if (ua.includes('Windows NT 10.0')) osVersion = 'Windows 10 / 11';
      else if (ua.includes('Windows NT 6.3')) osVersion = 'Windows 8.1';
      else if (ua.includes('Windows NT 6.2')) osVersion = 'Windows 8';
      else if (ua.includes('Windows NT 6.1')) osVersion = 'Windows 7';
      else osVersion = 'Windows';
    } else if (ua.includes('Mac')) {
      osFamily = 'macOS';
      const macMatch = ua.match(/Mac OS X ([0-9_]+)/);
      osVersion = macMatch ? `macOS ${macMatch[1].replace(/_/g, '.')}` : 'macOS';
      if (ua.includes('ARM') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
        architecture = 'arm64';
      }
    } else if (ua.includes('Android')) {
      osFamily = 'Android';
      const androidMatch = ua.match(/Android ([0-9.]+)/);
      osVersion = androidMatch ? `Android ${androidMatch[1]}` : 'Android';
      architecture = 'arm64';
    } else if (ua.includes('CrOS')) {
      osFamily = 'ChromeOS';
      osVersion = 'ChromeOS';
    } else if (ua.includes('Linux')) {
      osFamily = 'Linux';
      osVersion = 'Linux';
    }
  }

  // Detect 64-bit vs 32-bit architecture if not resolved by hints
  if (!bitness || bitness === '64') {
    if (ua.includes('WOW64') || ua.includes('Win64') || ua.includes('x86_64') || ua.includes('amd64')) {
      bitness = '64';
      if (!architecture.includes('arm')) architecture = 'x86_64';
    } else if (ua.includes('i686') || ua.includes('i386') || ua.includes('Win32')) {
      bitness = '32';
      architecture = 'x86_32';
    }
  }

  // 3. Virtual Machine (VM) / Emulation Detection
  let isVirtualMachineDetected = false;
  let vmIndicator = 'None';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const rLower = (renderer || '').toLowerCase();
      if (rLower.includes('vmware')) {
        isVirtualMachineDetected = true;
        vmIndicator = 'VMware Virtual GPU Adapter';
      } else if (rLower.includes('virtualbox') || rLower.includes('vbox')) {
        isVirtualMachineDetected = true;
        vmIndicator = 'VirtualBox Graphics Adapter';
      } else if (rLower.includes('qemu') || rLower.includes('virtio') || rLower.includes('red hat')) {
        isVirtualMachineDetected = true;
        vmIndicator = 'QEMU / KVM VirtIO';
      } else if (rLower.includes('llvmpipe') || rLower.includes('swiftshader')) {
        isVirtualMachineDetected = true;
        vmIndicator = `Software Emulation Renderer (${renderer})`;
      } else if (rLower.includes('microsoft basic render driver')) {
        isVirtualMachineDetected = true;
        vmIndicator = 'Microsoft Basic Render Driver (Emulated/Hyper-V)';
      }
    }
  } catch {}

  return {
    osFamily,
    osVersion,
    platformVersion,
    architecture,
    bitness,
    model,
    isVirtualMachineDetected,
    vmIndicator
  };
}

export async function getNetworkGeoTelemetry() {
  // Query GeoIP & Network telemetry
  try {
    const geoRes = await fetch('http://ip-api.com/json/?fields=status,message,country,regionName,city,zip,lat,lon,timezone,isp,org,as,proxy,hosting,query', {
      signal: AbortSignal.timeout(2500)
    });
    if (geoRes.ok) {
      const data = await geoRes.json();
      if (data.status === 'success') {
        return {
          publicIp: data.query || 'Unknown',
          country: data.country || 'Unknown',
          region: data.regionName || 'Unknown',
          city: data.city || 'Unknown',
          zip: data.zip || '',
          latitude: data.lat || null,
          longitude: data.lon || null,
          timezone: data.timezone || 'Asia/Kolkata',
          isp: data.isp || 'Unknown',
          organization: data.org || 'Unknown',
          asNumber: data.as || 'Unknown',
          isProxyOrVpn: Boolean(data.proxy),
          isDatacenterHosting: Boolean(data.hosting),
          resolvedAt: new Date().toISOString()
        };
      }
    }
  } catch {
    // If ip-api failed (e.g. adblocker or HTTP limitation in HTTPS), attempt fallback
  }

  try {
    const ipRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(2000) });
    if (ipRes.ok) {
      const ipData = await ipRes.json();
      return {
        publicIp: ipData.ip || 'Unknown',
        country: 'India',
        region: 'Direct Network',
        city: 'Local',
        zip: '',
        latitude: null,
        longitude: null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
        isp: 'Local ISP',
        organization: 'Direct Provider',
        asNumber: 'N/A',
        isProxyOrVpn: false,
        isDatacenterHosting: false,
        resolvedAt: new Date().toISOString()
      };
    }
  } catch {}

  return {
    publicIp: 'Local / Direct Network',
    country: 'Unknown',
    region: 'Unknown',
    city: 'Unknown',
    zip: '',
    latitude: null,
    longitude: null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
    isp: 'Unknown ISP',
    organization: 'Unknown Org',
    asNumber: 'N/A',
    isProxyOrVpn: false,
    isDatacenterHosting: false,
    resolvedAt: new Date().toISOString()
  };
}

export async function extractComprehensiveClientSecurity() {
  try {
    const [osDetails, network] = await Promise.all([
      getHighEntropyOsMetadata(),
      getNetworkGeoTelemetry()
    ]);

    const isExtended = !!(window.screen && (window.screen.isExtended || (window.screenLeft < 0 || window.screenTop < 0)));

    let gpuRenderer = 'Generic Hardware Accelerator';
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || gpuRenderer;
        }
      }
    } catch {}

    let batteryInfo = { level: 100, charging: true };
    try {
      if (navigator.getBattery) {
        const battery = await navigator.getBattery();
        batteryInfo = {
          level: Math.round(battery.level * 100),
          charging: battery.charging
        };
      }
    } catch {}

    const ua = navigator.userAgent || '';
    let browserName = 'Google Chrome';
    let browserVersion = '';
    if (ua.includes('Edg/')) {
      browserName = 'Microsoft Edge';
      browserVersion = ua.match(/Edg\/([0-9.]+)/)?.[1] || '';
    } else if (ua.includes('Chrome/')) {
      browserName = 'Google Chrome';
      browserVersion = ua.match(/Chrome\/([0-9.]+)/)?.[1] || '';
    } else if (ua.includes('Firefox/')) {
      browserName = 'Mozilla Firefox';
      browserVersion = ua.match(/Firefox\/([0-9.]+)/)?.[1] || '';
    } else if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
      browserName = 'Apple Safari';
      browserVersion = ua.match(/Version\/([0-9.]+)/)?.[1] || '';
    }

    return {
      ip: network.publicIp,
      userAgent: ua,
      operatingSystem: osDetails.osVersion || osDetails.osFamily,
      osDetails,
      network,
      browser: browserName,
      browserDetails: {
        name: browserName,
        version: browserVersion,
        language: navigator.language || 'en-US',
        languages: navigator.languages ? Array.from(navigator.languages) : ['en-US'],
        cookieEnabled: navigator.cookieEnabled,
        pdfViewerEnabled: navigator.pdfViewerEnabled || false
      },
      screenResolution: `${window.screen?.width || 1920} x ${window.screen?.height || 1080} px`,
      windowResolution: `${window.innerWidth} x ${window.innerHeight} px`,
      colorDepth: window.screen?.colorDepth || 24,
      pixelRatio: window.devicePixelRatio || 1,
      hardwareConcurrency: navigator.hardwareConcurrency || 'N/A',
      deviceMemoryGB: navigator.deviceMemory || 'N/A',
      isExtendedDisplay: isExtended,
      webglRenderer: gpuRenderer,
      battery: batteryInfo,
      batteryLevel: `${batteryInfo.level}%`,
      isCharging: batteryInfo.charging,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
      capturedAt: new Date().toISOString()
    };
  } catch (err) {
    console.warn("[SECURITY_TELEMETRY]: Error collecting telemetry:", err);
    return {
      ip: 'Unknown',
      operatingSystem: 'Windows',
      browser: 'Google Chrome',
      capturedAt: new Date().toISOString()
    };
  }
}
