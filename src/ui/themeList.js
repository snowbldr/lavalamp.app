import { button, div, input, span } from '@srfnstack/fntags'
import { ask, notify } from './components.js'

// A list of named themes in the look of My Colors (settingsPanel.js): the built in ones first, then the ones saved in
// this browser, each with a pencil that loads it and turns its tile into a name field, a tick that keeps what is on the
// lamp then under that name and a cross that puts it back as it was saved; the plus saves what is on the lamp as a new
// one, the trash by the caption deletes one (the trash, then the theme, then a check). The Themes card's whole lamp
// themes and the Music card's My Shows are both one of these.
//   key: the browser's storage key for the saved ones; builtins: [{ name, ...data }]
//   take(): the lamp's data now; put(data): onto the lamp; changes(now, data): what loading data would reset, as
//   words ([] for nothing); paint(data): { background, back } for a tile, or null for a plain one;
//   onLoad(): after a theme is loaded, so the other lists can see what is on the lamp now.
//   share(theme): sends a link to a saved one; given, a paper plane by the trash shares the way My Colors' does (the
//   plane, then the theme; Robert: "we need sharing on the themes just like the colors and same for shows").
const ICON = body => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v
export const sameData = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))
const dataOf = t => { const { name, ...rest } = t; return rest }
const possessive = name => name.endsWith('s') ? `${name}'` : `${name}'s`

// The one check before a theme replaces what is on the lamp, the same for all three lists (Robert: "clicking on either
// music theme should ask an r u sure if there are any changes diverging from the theme"): what will change, by name
// and as it is now, and Apply or Cancel. Nothing different, no question.
export const confirmReset = (changes, name) => {
  if (!changes.length) return Promise.resolve(true)
  const shown = changes.length > 5 ? [...changes.slice(0, 4), `${changes.length - 4} more`] : changes
  const list = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0]
  return ask(`${list} will be reset to ${possessive(name)}.`, { yes: 'Apply', no: 'Cancel' })
}

export const themeList = ({ key, builtins, take, put, changes, paint = () => null, onLoad = () => {}, caption, what, newName, fallback = 'Mine', share = null }) => {
  let mine = []
  try { mine = JSON.parse(localStorage.getItem(key) || '[]').filter(t => t && typeof t.name === 'string') } catch (e) { mine = [] }
  const store = () => { try { localStorage.setItem(key, JSON.stringify(mine)) } catch (e) { notify(`Could not save the ${what} in this browser`) } }
  let loadedTheme = null
  let editing = null // { theme, saved }
  let deleting = false
  let sharing = false
  const grid = div({ class: 'themes named' })
  const trash = button({ class: 'theme-trash', title: `Delete a ${what}: press this, then the ${what}`, 'aria-label': `Delete a ${what}`, onclick: () => { stopEditing(); sharing = false; deleting = !deleting; fill() } })
  const plane = share ? button({ class: 'theme-trash theme-share', title: `Share a ${what}: press this, then the ${what}`, 'aria-label': `Share a ${what}`, onclick: () => { stopEditing(); deleting = false; sharing = !sharing; fill() } }) : null
  if (plane) plane.innerHTML = ICON('<path d="M22 3L10 14"/><path d="M22 3l-7 18-5-7-7-5 19-6z"/>')
  trash.innerHTML = ICON('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')
  const editName = input({ class: 'edit-name', type: 'text', maxlength: 24, autocomplete: 'off', spellcheck: false, 'aria-label': `${what} name`,
    onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter') stopEditing('save'); else if (e.key === 'Escape') stopEditing('cancel') } })
  const editSave = button({ class: 'icon-button primary edit-save', title: `Save this ${what}`, 'aria-label': `Save this ${what}`, onclick: () => stopEditing('save') })
  editSave.innerHTML = ICON('<path d="M4 12.5l5 5L20 6.5"/>')
  const editCancel = button({ class: 'icon-button edit-cancel', title: `Cancel: put the ${what} back as it was`, 'aria-label': 'Cancel the edit', onclick: () => stopEditing('cancel') })
  editCancel.innerHTML = ICON('<path d="M6 6l12 12M18 6L6 18"/>')
  const style = (el, data) => {
    const look = paint(data)
    if (!look) { el.classList.add('plain'); return }
    el.style.background = look.background
    if (look.back) el.style.setProperty('--theme-back', look.back)
  }
  // Ask only when the lamp has drifted from a theme in this list (Robert: "clicking on either music theme should ask an r u
  // sure if there are any changes diverging from the theme"): a lamp still exactly on the theme loaded last, or on any
  // built in or saved one, has nothing of its own to lose, so Vibes to Calm and back at their defaults never asks.
  const unchanged = () => { const now = take(); return [...(loadedTheme ? [loadedTheme] : []), ...builtins, ...mine].some(t => !changes(now, dataOf(t)).length) }
  const load = async theme => {
    if (!unchanged() && !(await confirmReset(changes(take(), dataOf(theme)), theme.name))) return false
    put(dataOf(theme))
    loadedTheme = theme
    onLoad()
    return true
  }
  const startEditing = theme => {
    editing = { theme, saved: JSON.parse(JSON.stringify(theme)) }
    editName.value = theme.name
    fill()
    setTimeout(() => { editName.focus(); editName.select() })
  }
  const stopEditing = (how = 'leave') => {
    if (!editing) return
    const { theme, saved } = editing
    if (how === 'save') {
      const name = editName.value.trim().slice(0, 24) || theme.name
      for (const k of Object.keys(theme)) delete theme[k]
      Object.assign(theme, { name }, take())
      store()
      loadedTheme = theme
      onLoad()
    } else if (how === 'cancel') {
      put(dataOf(saved))
      loadedTheme = theme
      onLoad()
    }
    editing = null
    fill()
  }
  const tile = (theme, isMine) => {
    if (editing && editing.theme === theme) {
      const row = div({ class: 'theme-item edit-row' }, editName, div({ class: 'edit-actions' }, editSave, editCancel))
      style(row, take())
      return row
    }
    const t = button({
      class: theme === loadedTheme ? 'theme staged' : 'theme',
      title: theme.name,
      onclick: () => {
        stopEditing()
        if (sharing && isMine) {
          sharing = false
          fill()
          share(theme)
          return
        }
        if (deleting && isMine) {
          ask(`Delete ${theme.name}?`, { yes: 'Delete', danger: true }).then(yes => {
            if (yes) { mine = mine.filter(x => x !== theme); if (loadedTheme === theme) loadedTheme = null; store() }
            deleting = false
            fill()
          })
          return
        }
        load(theme).then(ok => { if (ok) fill() })
      }
    }, span(theme.name))
    style(t, dataOf(theme))
    if (!isMine) return t
    const edit = button({ class: 'theme-edit', title: `Rename or save over ${theme.name}`, 'aria-label': `Edit ${theme.name}`, onclick: () => {
      stopEditing()
      deleting = false
      load(theme).then(ok => { if (ok) startEditing(theme) })
    } })
    edit.innerHTML = ICON('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/>')
    return div({ class: 'theme-item' }, t, edit)
  }
  const fill = () => {
    const add = button({
      class: 'theme theme-add',
      title: `Save what is on the lamp now as a new ${what}`,
      'aria-label': `Save as a new ${what}`,
      onclick: () => {
        stopEditing()
        deleting = false
        sharing = false
        let n = mine.length + 1
        while (mine.some(t => t.name === newName(n))) n++
        const theme = { name: newName(n), ...take() }
        mine.push(theme)
        store()
        loadedTheme = theme
        onLoad()
        startEditing(theme)
      }
    }, span('+'))
    grid.replaceChildren(...builtins.map(t => tile(t, false)), ...mine.map(t => tile(t, true)), add)
    // Every tile in its own cell, so the edit row can lie across its row without moving the rest.
    const items = [...grid.children]
    const editAt = items.findIndex(item => item.classList.contains('edit-row'))
    items.forEach((item, k) => {
      const across = k === editAt
      item.style.gridRow = String(Math.floor(k / 2) + 1)
      item.style.gridColumn = across ? '1 / -1' : String(k % 2 + 1)
      item.style.visibility = editAt >= 0 && !across && Math.floor(k / 2) === Math.floor(editAt / 2) ? 'hidden' : ''
    })
    if (!mine.length) { deleting = false; sharing = false }
    grid.classList.toggle('deleting', deleting)
    grid.classList.toggle('sharing', sharing)
    trash.classList.toggle('on', deleting)
    trash.style.visibility = mine.length ? 'visible' : 'hidden'
    if (plane) { plane.classList.toggle('on', sharing); plane.style.visibility = trash.style.visibility }
  }
  // What is on the lamp, matched to a theme: a saved one first, then a built in one, or none.
  const rematch = () => {
    if (editing) return
    const now = take()
    loadedTheme = [...mine, ...builtins].find(t => sameData(dataOf(t), now)) || null
    fill()
  }
  // A theme from a share link: kept unless one with the same data is already saved, renamed if its name is taken.
  const add = theme => {
    const same = mine.find(t => sameData(dataOf(t), dataOf(theme)))
    if (same) return same
    const base = String(theme.name).slice(0, 24) || fallback
    let name = base
    for (let n = 2; mine.some(t => t.name === name) || builtins.some(t => t.name === name); n++) name = `${base} ${n}`
    const t = { ...theme, name }
    mine.push(t)
    store()
    fill()
    return t
  }
  // A theme from its own link (settingsPanel.js, ?show= and ?lamp=): added as above and put on the lamp.
  const adopt = theme => {
    const t = add(theme)
    put(dataOf(t))
    loadedTheme = t
    onLoad()
    fill()
    return t
  }
  rematch()
  return {
    // With no caption the list is its grid alone, and its trash goes where the caller puts it (the Themes card's title).
    element: caption ? div({ class: 'swatch-row' }, div({ class: 'swatch-caption my-themes-caption' }, span(caption), span({ class: 'theme-tools' }, ...(plane ? [plane] : []), trash)), grid) : div({ class: 'swatch-row' }, grid),
    trash,
    plane,
    // The theme on the lamp: whether it is one of the saved ones and whether the lamp still matches it.
    current: () => loadedTheme && { theme: loadedTheme, data: dataOf(loadedTheme), mine: mine.includes(loadedTheme), same: sameData(dataOf(loadedTheme), take()) },
    rematch,
    add,
    adopt,
    stop: () => stopEditing()
  }
}
