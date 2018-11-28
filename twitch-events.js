let _ws = new WeakMap()
let _clientId = new WeakMap()
let _nick = new WeakMap()
let _defaultEventsHandled = new WeakMap()
let _channelIds = new WeakMap()
let _channelNames = new WeakMap()
let _channelRooms = new WeakMap()
let _password = new WeakMap()

const _OnWebsocketOpen = Symbol('onWebsocketOpen')
const _OnWebsocketMessage = Symbol('onWebsocketMessage')
const _OnWebsocketError = Symbol('onWebsocketError')
const _OnWebsocketClose = Symbol('onWebsocketClose')

class TwitchClient {
    constructor(options) {
        // Initializing publics
        this.options = options
        this.Debug = (typeof options === 'undefined') ? false : options.Debug
        this.Nickname = (typeof options === 'undefined') ? false : options.Nick
        this.Channels = []
        this.PendingChannels = []

        // Initializing public events
        this.onMessage = () => this.SetDefaultEventHandled('onMessage')
        this.onPrivmsg = () => this.SetDefaultEventHandled('onPrivmsg')
        this.onJoin = () => this.SetDefaultEventHandled('onJoin')
        this.onPart = () => this.SetDefaultEventHandled('onPart')
        this.onRoomstate = () => this.SetDefaultEventHandled('onRoomstate')
        this.onUsernotice = () => this.SetDefaultEventHandled('onUsernotice')

        // Initializing privates
        _ws.set(this, null)
        typeof options === 'undefined' ? _clientId.set(this, null) : _clientId.set(this, options.ClientID)
        _nick.set(this, null)
        typeof options === 'undefined' ? _password.set(this, false) : _password.set(this, options.Pass)
        _defaultEventsHandled.set(this, {})
        _channelIds.set(this, {})
        _channelNames.set(this, {})
        _channelRooms.set(this, {})

        // Miscellaneous Logic
        if(typeof options !== 'undefined' && options.Channels) {
            Array.isArray(options.Channels) 
                ? this.PendingChannels = options.Channels 
                : this.PendingChannels.push(options.Channels)
        }

        if(typeof _clientId.get(this) === null && this.Debug)
            console.log('ClientID not provided; follower data will not be available.')
        else this.ClientID = _clientId.get(this)
    }

    // Private methods
    [_OnWebsocketOpen]() {
        _ws.get(this).send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership')
        if(this.Nickname && _password.get(this)) {
            _ws.get(this).send(`PASS ${_password.get(this).indexOf('oauth:') == 0 ? '' : 'oauth:'} ${_password.get(this)}`)
            _ws.get(this).send(`NICK ${this.Nickname}`)
        }
        else _ws.get(this).send(`NICK justinfan${Math.floor(Math.random() * 999999)}`)

        let index = 0
        while(index < this.PendingChannels.length) {
            if(this.PendingChannels[index].indexOf(':') == -1) {
                let channel = this.PendingChannels[index].trim()
                if(channel.indexOf('#') != 0) channel = '#' + channel
                _ws.get(this).send(`JOIN ${channel}`)
                this.Channels.push(channel)
                this.PendingChannels.shift()
            }
            index++
        }
    }

    [_OnWebsocketMessage](messageObject) {
        const data = messageObject.data.split('\r\n')

        for(const line of data) {
            if(line.trim() === '') continue
            if(this.Debug) console.log(`>${line}`)
            if(this.onMessage) this.onMessage(line)

            const parts = line.split(' ')

            if(parts[0] === 'PING')
                _ws.get(this).send(`PONG ${parts[1].substring(1)}`)
            else if(parts[1] === 'JOIN') {
                if(this.onJoin)
                    this.onJoin(parts[0]
                        .split(':')[1]
                        .split('!')[0], parts[2])
                    // fireEvent('onJoin', line)
            }
            else if(parts[1] === 'PART') {
                if(this.onPart)
                    this.onPart(parts[0]
                        .split(':')[1]
                        .split('!')[0], parts[2])
                    // fireEvent('onPart', line)
            }
            // else if(parts[1] === 'MODE') fireEvent('onMode', line)
            else if(parts[2] === 'PRIVMSG') {
                const userData = parts[0].split(';')
                const user = parts[1]
                    .split(':')[1]
                    .split('!')[0]
                const channel = parts[3]
                const index = line.indexOf(':', line.indexOf(channel))
                const message = line.substring(index + 1)
                let userDataObject = {}

                for(s of userData) {
                    const sides = s.split('=')
                    userDataObject[sides[0]] = sides[1]
                }

                if(this.onPrivmsg)
                    this.onPrivmsg(user, channel.substring(1), message, userDataObject, line)
            }
            else if(parts[2] === 'ROOMSTATE') {
                // const parts = line.split(' ')
                const userData = parts[0].split(';')
                const channel = line.split(' ')[3]
                    .substring(1)
                    .trim()
                    .toLowerCase()
                let userDataObject = {}

                for(s of userData) {
                    const sides = s.split('=')
                    userDataObject[sides[0]] = sides[1]
                }

                // channel record has already been created, bail
                // if (typeof _channelIds.get(this)[channel] !== null) return

                // for (let i = 0; i < userdata.length; i++) {
                //    if (userData[i].indexOf('room-id') == 0) {
                //        _channelIds[channel].set(this, userData[i].split('=')[1])
                //        _channelNames[userdata[i].split('=')[1]].set(this, channel)
                //        _channelRooms[userdata[i].split('=')[1]].set(this, {})
                //        break
                //    }
                // }

                if(this.onRoomstate) this.onRoomstate(channel, userDataObject)
            }
            else if (parts[2] === 'USERNOTICE') {
                this.onUsernotice(line)
                const messageParts = parts[0].split(';')
                let isSub

                // Kexerval: You never defined 'isSub' in your codebase, so I had to
                // take a guess that it should be local to the USERNOTICE if statement
                // If you use this variable somewhere else, you'll need to use a different
                // approach
                for(let i = 0; i < messageParts.length; i++) {
                    switch(messageParts[i]) {
                        case 'msg-id=sub':
                            isSub = 0
                            break
                        case 'msg-id=resub':
                            isSub = 1
                            break
                        case 'msg-id=subgift':
                            isSub = 2
                            break
                    }
                }
            }
            // else console.log(`>${line}`)
        }
    }

    [_OnWebsocketError](error) {
        if(this.Debug) console.error(`Websocket error: ${error}`)
        setTimeout(() => {
            this.Connect()
        }, 1000)
    }

    [_OnWebsocketClose]() {
        setTimeout(() => {
            this.Connect()
        }, 1000)
    }

    // Public methods
    Connect() {
        for(c of this.Channels) this.PendingChannels.push(c)

        this.Channels = []
        _ws.set(this, new WebSocket('wss://irc-ws.chat.twitch.tv'))
        // Let's play a game called "Which 'this' does this?"
        _ws.get(this).onopen = this[_OnWebsocketOpen].bind(this)
        _ws.get(this).onmessage = this[_OnWebsocketMessage].bind(this)
        _ws.get(this).onerror = this[_OnWebsocketError].bind(this)
        _ws.get(this).onclose = this[_OnWebsocketClose].bind(this)
    }

    // Sends a message to the specified channel
    SendMessage(channel, message) {
        if(channel.indexOf('#') != 0) channel = '#' + channel

        _ws.get(this).send(`PRIVMSG ${channel} :${message}`)
    }

    // Joins a channel/array of channels
    JoinChannels(channels) {
        let array = []

        if(!Array.isArray(channels)) array.push(channels)
        else array = channels

        for(let c of array) {
            c = c.trim().toLowerCase()

            // if(c.split(':').length == 3)
            //     throw new TypeError('Chat rooms must be joined by <channel name>:<room name>')
            // else if(c.split(':').length == 2) {}

            if(c[0] != '#') c = '#' + c
            if(_ws.get(this).readyState) {
                this.Channels.push(c)
                _ws.get(this).send(`JOIN ${c}`)
            }
            else this.PendingChannels.push(c)
        }
    }

    // Leave a channel/array of channels
    LeaveChannels(channels) {
        let array = []

        Array.isArray(channels) ? array = channels : array.push(channels)

        for(c of array) {
            // undefined is falsey so we just check if c exists
            if(c) {
                c = c.trim().toLowerCase()
                
                if(c[0] != '#') c = '#' + c
                if(_ws.get(this).readyState == 1) {
                    let i = this.Channels.indexOf(c)
                    
                    _ws.get(this).send(`PART ${c}`)
                    this.Channels.splice(i, 1)
                }
                else {
                    let i = this.PendingChannels.indexOf(c)
                    this.PendingChannels.splice(i, 1)
                }
            }
        }
    }

    // Default events are now located in the constructor
    SetDefaultEventHandled(eventName) {
        if(!_defaultEventsHandled.get(this)[eventName]) {
            console.warn(`${eventName} event not handled!`)
            _defaultEventsHandled.get(this)[eventName] = true
        }
    }

    DebugFunction() {
        console.debug('channel id list:     ', _channelIds.get(this))
        console.debug('channel name list:   ', _channelNames.get(this))
    }
}