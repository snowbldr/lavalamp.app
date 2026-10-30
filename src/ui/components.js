import { div, label } from '@srfnstack/fntags'

export const formInput = (inputLabel, theInput, resetButton) => {
  theInput.style.cursor = 'pointer'
  return div(
    {
      style: {
        display: 'flex',
        'flex-direction': 'row',
        width: '100%',
        margin: '10px',
        'justify-content': 'space-between'
      }
    },
    label({ for: theInput.getAttribute('id') }, inputLabel),
    div(
      {
        style: {
          display: 'flex',
          'flex-direction': 'row'
        }
      },
      theInput,
      resetButton || ''
    )
  )
}

export const resetToDefaultButton = (onclick) => div(
  {
    onclick,
    title: 'Reset To Default',
    style: {
      cursor: 'pointer',
      'margin-right': '-10px',
      'margin-left': '20px'
    }
  },
  'x'
)

export function notify (...message) {
  const notification = div(
    {
      style: {
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        width: '25vw',
        'min-width': '250px',
        background: 'rgb(220,220,220,.6)',
        'text-align': 'center',
        'line-height': '100px',
        'font-size': '25px',
        'z-index': 100,
        'border-radius': '8px'
      }
    },
    ...message
  )
  document.body.append(notification)
  const duration = 2000
  notification.animate([{ opacity: 1 }, { opacity: 0 }], duration)
  notification.style.opacity = 0
  setTimeout(() => notification.remove(), duration)
}
