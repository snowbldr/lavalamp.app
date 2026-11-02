// The one script an older version of the lamp carries: a strip along the bottom offering the
// newest version, so a link or a save that pins someone to an old lamp does not pin them there
// for good (Robert: "we need a 'New version available! activate now?' banner with a button so
// people eventually see the new version"). Activating hands the old version's settings (the
// share link's, or the saved ones) to the root page, which maps them onto the new version.
// Plain script, no modules, so it runs in the 2020 pages as well.
(function () {
  var script = document.currentScript
  var here = script.getAttribute('data-version')
  var base = new URL('.', script.src)
  var DISMISSED = 'lavalamp.app-banner-dismissed'
  fetch(new URL('versions.json', base)).then(function (r) { return r.json() }).then(function (manifest) {
    var list = manifest.versions
    var newest = list[list.length - 1]
    if (newest.version === here) return
    try { if (sessionStorage.getItem(DISMISSED) === newest.version) return } catch (e) {}
    var mine = null
    for (var i = 0; i < list.length; i++) if (list[i].version === here) mine = list[i]
    var strip = document.createElement('div')
    strip.id = 'lavalamp-version-banner'
    strip.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:1000;display:flex;align-items:center;justify-content:center;gap:12px;padding:8px 12px;background:rgba(20,20,22,0.86);color:#ececec;font:14px system-ui,sans-serif'
    var text = document.createElement('span')
    text.textContent = 'New version available! Activate now?'
    var yes = document.createElement('button')
    yes.textContent = 'Activate ' + newest.label
    yes.style.cssText = 'padding:4px 12px;border-radius:6px;border:0;background:#f0a030;color:#111;font:inherit;cursor:pointer'
    var later = document.createElement('button')
    later.textContent = 'Later'
    later.style.cssText = 'padding:4px 10px;border-radius:6px;border:1px solid rgba(236,236,236,0.4);background:transparent;color:#ececec;font:inherit;cursor:pointer'
    later.onclick = function () {
      try { sessionStorage.setItem(DISMISSED, newest.version) } catch (e) {}
      strip.remove()
    }
    yes.onclick = function () {
      // The settings this lamp is showing: the link's if there is one, else what it saved.
      var query = new URLSearchParams(window.location.search)
      var from = query.get('shared') || ''
      if (!from && mine && mine.settingsKey) {
        try {
          var saved = localStorage.getItem(mine.settingsKey)
          if (saved) from = btoa(saved)
        } catch (e) {}
      }
      var target = new URL(manifest.root, base)
      target.search = '?v=' + newest.version + '&upgrade=' + here + (from ? '&from=' + encodeURIComponent(from) : '')
      window.location.href = target.href
    }
    strip.appendChild(text)
    strip.appendChild(yes)
    strip.appendChild(later)
    document.body.appendChild(strip)
  }).catch(function () {})
})()
