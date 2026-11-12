// How to get the lamp with nothing around it on an iPhone, where a web page cannot go fullscreen: add it to the Home
// Screen and open it from there (Robert: "I think we should probably hide the checkbox on ios and replace it with a ?
// that explains how to make fullscreen work on the app. make the directions grandma friendly and consider the ios
// versions"). Only the steps for the browser in hand, in plain words, the buttons told by how they look.
//
// The Safari buttons are as Apple's iPhone User Guide has them ("Add a website icon to your Home Screen", read
// 2026-11-11): iOS 27, the Page Menu button (three short lines) then Share; iOS 26, the More button (three dots) then
// Share; either, the Share button straight away when the Tabs layout is Bottom or Top; then Add to Home Screen, Open as
// Web App, Add. iOS 18 and before, the Share button in the bar at the bottom. Before iOS 16.4 only Safari can add one.
//
// Safari from iOS 26 reports the system as iOS 18 in its user agent, so its version is read from Safari's own
// "Version/NN"; the system version is used only to tell whether another browser is new enough (16.4).

const SHARE = 'the Share button (a square with an arrow pointing up)'
const ADD = 'Scroll down and tap Add to Home Screen.'
const LAST = 'Close this, then open the lava lamp from its new icon on your Home Screen.'

const versionOf = (ua, pattern) => {
  const m = ua.match(pattern)
  return m ? Number(m[1]) + Number(m[2] || 0) / 100 : 0
}

export const isIphone = ua => /iPhone|iPod/.test(ua)

// The steps, each a sentence, for this browser.
export const homeScreenSteps = (ua = navigator.userAgent, here = window.location.host || 'lavalamp.app') => {
  if (!isIphone(ua)) return ['Open your browser\'s menu and tap Add to Home screen (or Install app).', LAST]
  const system = versionOf(ua, /OS (\d+)_(\d+)/)
  const other = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA\//.exec(ua)
  const safariSteps = safari => safari >= 27
    ? ['Tap the button with three short lines next to the address bar, then tap Share. If you already see a Share button, a square with an arrow pointing up, just tap that.', ADD, 'Make sure Open as Web App is on, then tap Add.', LAST]
    : safari >= 26
      ? ['Tap the button with three dots (...) next to the address bar, then tap Share. If you already see a Share button, a square with an arrow pointing up, just tap that.', ADD, 'Make sure Open as Web App is on, then tap Add.', LAST]
      : ['Tap ' + SHARE + '. It is in the bar at the bottom of the screen.', ADD, 'Tap Add.', LAST]
  if (!other) return safariSteps(versionOf(ua, /Version\/(\d+)(?:\.(\d+))?/))
  if (system && system < 16.04) return ['This only works in Safari (the blue compass). Open Safari and go to ' + here + '.', ...safariSteps(0)]
  const name = { CriOS: 'Chrome', FxiOS: 'Firefox', EdgiOS: 'Edge' }[other[0]]
  return [
    name === 'Chrome' ? 'Tap ' + SHARE + ', at the right of the address bar.' : 'Tap this browser\'s Share button (a square with an arrow pointing up). If you cannot see it, look in the menu.',
    ADD, 'Tap Add.', LAST
  ]
}
