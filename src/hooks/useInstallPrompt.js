import { useState, useEffect } from 'react';

export function useInstallPrompt() {
    const [installPrompt, setInstallPrompt] = useState(null);
    const [showIOSInstall, setShowIOSInstall] = useState(false);

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const showIOSButton = isIOS && !isStandalone && !localStorage.getItem('ios_install_dismissed');

    useEffect(() => {
        const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstall = async () => {
        if (!installPrompt) return;
        installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        if (outcome === 'accepted') setInstallPrompt(null);
    };

    const dismissIOSInstall = () => {
        setShowIOSInstall(false);
        localStorage.setItem('ios_install_dismissed', '1');
    };

    return {
        installPrompt,
        showIOSInstall,
        setShowIOSInstall,
        showIOSButton,
        handleInstall,
        dismissIOSInstall,
    };
}
