/** Android browser (not the Android app itself): offer the app download page. */
export const offerAndroidApp = /android/i.test(navigator.userAgent) && !window.Capacitor?.isNativePlatform?.();

/** The download page (public/download/), relative to the game. */
export const ANDROID_APP_PAGE = './download/';
