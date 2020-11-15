import { button, div, img, input, label, style } from './fnelements.js'
import { fnstate } from './fntags.js'

const defaultLavaColor = '#BE01E4'
let defaultBgColor = '#ff5100'
let defaultSpeed = 1

let lavaColor = fnstate( defaultLavaColor )
let bgColor = fnstate( defaultBgColor )
let speed = fnstate( defaultSpeed )
let defaultAmountOfLava = Math.trunc(25 * (window.innerHeight/1000))
let amountOfLava = fnstate( defaultAmountOfLava )
let lavaCount = amountOfLava()

document.body.append( style( `
    #lavalamp {
        filter: url("#lava");
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        right: 0;
    }

    .lava {   
        border-radius: 50%;
        position: absolute;
        transition-timing-function: linear;
    }
` ) )

let filter = div()
filter.innerHTML = ``

let settingsKey = 'lavalamp.app-settings'
if( localStorage.getItem( settingsKey ) ) {
    let stored = JSON.parse( localStorage.getItem( settingsKey ) )
    lavaColor( stored.lavaColor || lavaColor() )
    bgColor( stored.bgColor || bgColor() )
    speed( stored.speed || speed() )
}

const saveSettings = () => {
    localStorage.setItem( settingsKey, JSON.stringify( { lavaColor: lavaColor(), bgColor: bgColor(), speed: speed() } ) )
}

const resetDefaults = () => {
    localStorage.removeItem( settingsKey )
    lavaColor( defaultLavaColor )
    bgColor( defaultBgColor )
    speed( defaultSpeed )
    amountOfLava( defaultAmountOfLava )
}


document.body.style.background = bgColor()
bgColor.subscribe( () => {
    document.body.style.background = bgColor()
} )

const randomBetween = ( min, max ) => Math.trunc( Math.random() * ( max - min ) + min )

function randomNormalDistribution( min, max, skew = 1 ) {
    let u = 0, v = 0
    while( u === 0 ) {
        u = Math.random()
    } //Converting [0,1) to (0,1)
    while( v === 0 ) {
        v = Math.random()
    }
    let num = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v )

    num = num / 10.0 + 0.5 // Translate to 0 -> 1
    if( num > 1 || num < 0 ) num = randomNormalDistribution( min, max, skew ) // resample between 0 and 1 if out of range
    num = Math.pow( num, skew ) // Skew
    num *= max - min // Stretch to fill range
    num += min // offset to min
    return Math.trunc( num )
}


const animateLava = () => {
    let lastTime = 0

    const createLava = () => {
        const lavaSize = randomNormalDistribution( 100, 500, 3 ) * ( window.innerWidth / 1500 )
        let left = randomBetween( -40, window.innerWidth + 10 )
        let lavaTop = window.innerHeight
        let lavaBottom = -( lavaSize / 2 )
        let lava = div(
            {
                style: {
                    position: 'absolute',
                    'border-radius': '50%',
                    height: lavaSize + 'px',
                    width: lavaSize + 'px',
                    background: lavaColor(),
                    bottom: lavaBottom + 'px',
                    left: left + 'px'
                }
            } )

        lavalamp.appendChild( lavaColor.bindAs( lava, () => lava.style.backgroundColor = lavaColor() ) )
        let nextIsRise = true
        const animate = () => {
            let animateTime = ( randomNormalDistribution( 15, 45, 1 ) * 1000 ) / speed()

            let frames = [
                { bottom: `${lavaBottom}px`, ease: 'ease-in' },
                { bottom: `${lavaTop}px`, ease: 'ease-out' }
            ]

            if( !nextIsRise )
                frames = frames.reverse()

            nextIsRise = !nextIsRise
            lava.animate( frames, animateTime )
            lava.style.bottom = frames[ 1 ].bottom
            setTimeout( animate, animateTime + randomNormalDistribution( 500, 15000 ) / speed() )
        }
        setTimeout( animate, lastTime + randomNormalDistribution( 500, 15000 ) / speed() )
        lastTime += randomNormalDistribution( 400, 5000 ) / speed()
    }

    for( let i = 0; i < lavaCount; i++ ) {
        createLava()
    }
}

const formInput = ( inputLabel, theInput ) =>
    div(
        {
            style: {
                display: 'flex',
                'flex-direction': 'row',
                'width': '100%',
                margin: '10px',
                'justify-content': 'space-between'
            }
        },
        label( { for: theInput.getAttribute( 'id' ) }, inputLabel ),
        theInput
    )

const settings = div( {
                          style: {
                              position: 'fixed',
                              bottom: '20px',
                              right: '20px',
                              background: 'rgb(255,255,255,.75)',
                              'z-index': 20,
                              padding: '25px 50px',
                              display: 'flex',
                              'border-radius': '10px',
                              'flex-direction': 'column',
                              'justify-content': 'space-evenly',
                              'align-items': 'center'
                          }
                      },
                      formInput(
                          'Background Color',
                          input( { id: 'bgColor', type: 'color', value: bgColor.bindAttr(bgColor), onchange: ( e ) => bgColor( e.target.value ),
                                     style: {
                                         'border-radius': '5px',
                                         padding: '5px'
                                     }, } )
                      ),
                      formInput(
                          'Lava Color',
                          input( { id: 'lavaColor', type: 'color', value: lavaColor.bindAttr(lavaColor), onchange: ( e ) => lavaColor( e.target.value ),
                                     style: {
                                         'border-radius': '5px',
                                         padding: '5px'
                                     } } )
                      ),
                      formInput(
                          'Speed',
                          input( { id: 'speed', type: 'range', value: speed.bindAttr(speed), step: 0.1, min: 0.1, max: 8, onchange: ( e ) => speed( e.target.value ) } )
                      ),
                      formInput(
                          'Amount of Lava',
                          input( { id: 'lava-amount', type: 'range', value: amountOfLava.bindAttr(amountOfLava), step: 5, min: Math.trunc(defaultAmountOfLava / 2), max: Math.trunc(defaultAmountOfLava*2), onchange: ( e ) => amountOfLava( e.target.value ) } )
                      ),
                      formInput(
                          'Save',
                          button( { id: 'save', onclick: saveSettings,
                                      style: {
                                          'border-radius': '5px',
                                          padding: '5px'
                                      } }, 'Save' )
                      ),
                      formInput( 'Reset Defaults', button( { id: 'reset', onclick: resetDefaults,
                                                               style: {
                                                                   'border-radius': '5px',
                                                                   padding: '5px'
                                                               } }, 'Reset Defaults' ) ),
                      div( {
                               style: {
                                   position: 'absolute',
                                   top: '3px',
                                   right: '18px',
                                   'font-style': 'sans-serif',
                                   'font-size': '26px',
                                   cursor: 'pointer'
                               },
                               onclick: () => settings.remove()
                           },
                           'x'
                      )
)
let lavalamp = div(
    {
        id: 'lavalamp'
    } )
const bg = div( {
                    style: {
                        position: 'fixed',
                        'z-index': -100,
                        background: bgColor()
                    }
                } )
const showSettings = () =>
    document.body.append( settings )


const settingsIcon = div(
    {
        style: {
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            cursor: 'pointer',
            'z-index': 10
        }
    },
    img( { src: 'settings.png', width: '32px', height: '32px', onclick: showSettings } )
)
const reset = () => {
    defaultAmountOfLava = Math.trunc(25 * (window.innerHeight/1000))
    while(lavalamp.firstChild){
        lavalamp.firstChild.remove()
    }
    lavalamp.remove()
    bg.remove()
    settingsIcon.remove()

    document.body.append( lavalamp )
    document.body.append( bg )
    document.body.append( settingsIcon )


    animateLava()


}
window.addEventListener( 'resize', reset )
speed.subscribe( reset )
amountOfLava.subscribe( ()=>{
    lavaCount = amountOfLava() * (window.innerWidth/1000)
    reset()
} )


reset()
