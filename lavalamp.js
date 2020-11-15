import { div, style } from './fnelements.js'
import { fnstate } from './fntags.js'

let lavaColor = fnstate( '#9614b3' )
let bgColor = fnstate( '#ff5100' )

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

const lavalamp = div(
    {
        id: 'lavalamp'
    } )

document.body.style.background = bgColor()
bgColor.subscribe( () => document.body.style.background = bgColor() )

const randomBetween = ( min, max ) => Math.random() * ( max - min ) + min

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
    return num
}

let lavaCount = window.innerWidth/40

const animateLava = () => {
    let lastTime = 0

    const createLava = () => {
        const lavaSize = randomNormalDistribution( 1, 75, 2 )
        let left = randomBetween( -40, window.innerWidth + 10 )
        let lavaBottom = window.innerHeight - lavaSize
        let lava = div(
            {
                style: {
                    position: 'absolute',
                    'transition-timing-function': 'linear',
                    'border-radius': '50%',
                    height: lavaSize + 'vh',
                    width: lavaSize + 'vh',
                    background: lavaColor(),
                    transform: `translateY(${lavaBottom}px)`,
                    transition: 'transform 500ms ease',
                    left: left+'px'
                }
            } )

        lavalamp.appendChild( lavaColor.bindAs( lava, () => lava.style.backgroundColor = lavaColor() ) )
        let nextIsRise = true
        const animate = () => {
            let animateTime = randomNormalDistribution( 15, 45, 1 ) * 1000

            let frames = [
                { transform: `translateY(${lavaBottom}px)` },
                { transform: `translateY(${-lavaSize}px)` }
            ]

            if( !nextIsRise )
                frames = frames.reverse()

            nextIsRise = !nextIsRise
            lava.animate( frames, animateTime )
            setTimeout( () => lava.style.transform = frames[ 1 ].transform )
            setTimeout( animate, animateTime + randomNormalDistribution( 500, 15000 ) )
        }
        setTimeout( animate, lastTime + randomNormalDistribution( 500, 15000 ) )
        lastTime += randomNormalDistribution( 400, 5000 )
    }

    for( let i = 0; i < lavaCount; i++ ) {
        createLava()
    }
}

document.body.append( bgColor.bindAs( lavalamp, () => lavalamp.style.backgroundColor = bgColor() ) )

animateLava( lavalamp )
