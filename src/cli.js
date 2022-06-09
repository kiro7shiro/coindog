const termkit = require('../node_modules/terminal-kit/lib/termkit.js')
const terminal = termkit.terminal
const credentials = require('../credentials/credentials.js')
const { Coindog } = require('../src/Coindog.js')
const Table = require('easy-table')

const watchdog = new Coindog(credentials.BITFINEX, '../data/symbols.json')

// *helper functions

function filterObject(raw, allowed) {
    return Object.keys(raw)
        .filter(key => allowed.includes(key))
        .reduce((obj, key) => {
            obj[key] = raw[key]
            return obj
        }, {})
}

function statusToTable(status) {
    status.status = status.status === 'ok' ? terminal.str.green(status.status) : terminal.str.red(status.status)
    status.updated = new Date(status.updated).toLocaleString()
    return Table.print(status)
}

function balanceToTable(balance) {
    const keys = Object.keys(balance).filter(function (key) {
        return key !== 'info' && key !== 'free' && key !== 'used' && key !== 'total'
    })
    const result = []
    for (let kCnt = 0; kCnt < keys.length; kCnt++) {
        const key = keys[kCnt]
        const symbol = Object.assign({}, { symbol: key }, balance[key])
        result.push(symbol)
    }
    return Table.print(result)
}

function marketsToTable(markets) {
    const result = markets.reduce(function (accu, curr) {
        accu.push({ markets: curr.symbol })
        return accu
    }, [])
    return Table.print(result)
}

// *cli methods

async function cliInfo() {
    if (!watchdog.initialized) await watchdog.initialize()
    terminal('getting status informaions... ')
    let spinner = await terminal.spinner()
    const status = await watchdog.exchange.fetchStatus()
    spinner.hidden = true
    // print status info
    terminal('\n\n')
    terminal(statusToTable(status))
    terminal('\n')
    // print markets info
    terminal('watching\n')
    terminal(marketsToTable(watchdog.markets))
    terminal('\n')
    // print balance info
    terminal('loading balance... ')
    spinner = await terminal.spinner()
    const balance = await watchdog.loadBalance()
    spinner.hidden = true
    terminal('\n\n')
    terminal(balanceToTable(balance))
    terminal('\n')
}

async function cliSearch(key) {
    if (!watchdog.initialized) await watchdog.initialize()
    terminal(`searching '${key}'... `)
    const spinner = await terminal.spinner()
    const results = await watchdog.search(key)
    const items = results.reduce(function (prev, curr) {
        if (curr.score < 0.1) prev.push(`${curr.item}`)
        return prev
    }, [])
    spinner.hidden = true
    if (items.length) {
        terminal(`\nselect symbol to watch:\n`)
        const select = await terminal.gridMenu(items).promise
        await watchdog.save(select.selectedText)
        terminal(`\n${select.selectedText} saved...\n`)
    } else {
        terminal(`\nno markets found for: ${key}\n`)
    }
}

async function cliRemove(symbol) {
    if (!watchdog.initialized) await watchdog.initialize()
    if (!symbol) {
        const items = watchdog.markets.reduce(function (prev, curr) {
            prev.push(curr.symbol)
            return prev
        }, [])
        terminal(`select a symbol to remove:\n`)
        const select = await terminal.singleColumnMenu(items).promise
        symbol = select.selectedText
    }
    const result = await watchdog.remove(symbol)
    if (result) {
        terminal(`\n${result} removed...\n`)
    }
}

async function cliWatch(markets) {

    terminal.clear()

    const document = terminal.createDocument()

    const title = new termkit.TextBox({
        parent: document,
        content: 'COINDOG 1.0',
        contentHasMarkup: 'legacyAnsi',
        x: 1,
        y: 0,
        width: terminal.width,
        height: 1,
        attr: { bgColor: 'default' }
    })

    const marketsBox = new termkit.TextBox({
        parent: document,
        content: '',
        contentHasMarkup: 'legacyAnsi',
        x: 0,
        y: 0,
        attr: { bgColor: 'default' }
    })

    const balanceBox = new termkit.TextBox({
        parent: document,
        content: '',
        contentHasMarkup: 'legacyAnsi',
        x: 0,
        y: 0,
        attr: { bgColor: 'default' }
    })

    const messageBox = new termkit.TextBox({
        parent: document,
        content: '',
        contentHasMarkup: 'legacyAnsi',
        x: 0,
        y: 0,
        attr: { bgColor: 'default' }
    })

    const resize = function () {
        const { width, height } = terminal
        marketsBox.setSizeAndPosition({
            x: 1,
            y: title.outputY + 2,
            height: height / 2,
            width: width / 4
        })
        balanceBox.setSizeAndPosition({
            x: 1,
            y: height / 2,
            height: height / 2 - 1,
            width: width / 4
        })
        messageBox.setSizeAndPosition({
            x: 1,
            y: height - 2,
            height: 1,
            width: width
        })
    }

    let marketsData = []
    let marketsText = ''
    let balanceText = ''

    const updateMarkets = function (info) {

        // init text
        if (!marketsText.length) {
            marketsData = watchdog.markets.reduce(function (accu, curr) {
                accu.push({
                    symbol: curr.symbol,
                    first: '',
                    last: '',
                    fetched: '',
                    position: '',
                    trend: '',
                    signal: '',
                })
                return accu
            }, [])
        }

        // update market text
        if (info) {
            let mIdx = marketsData.findIndex(m => m.symbol === info.symbol)
            if (mIdx < 0) {
                marketsData.push(info)
                mIdx = marketsData.length - 1
            } else {
                marketsData[mIdx] = Object.assign(marketsData[mIdx], info)
            }
            // highlight updated row
            const table = Table.print(marketsData).split('\n').map((line, index) => {
                if (index < 2) return line
                if (index === mIdx + 2) {
                    return terminal.str.black.bgWhite(line)
                } else {
                    return terminal.str.defaultColor.bgDefaultColor(line)
                }
            })
            marketsText = table.join('\n')
        } else {
            marketsText = Table.print(marketsData)
        }

    }

    const updateBalance = function (balance) {
        balanceText = balanceToTable(balance)
    }

    const drawMarkets = function () {
        const marketsWidth = marketsText.split('\n')[0].length
        // TODO : move resizing to resize() function
        marketsBox.setSizeAndPosition({ x: 1, y: title.outputY + 2, width: marketsWidth, height: terminal.height / 2 - 1 })
        marketsBox.setContent(marketsText, 'legacyAnsi')
    }

    const drawBalance = function () {
        const balanceHeight = balanceText.split('\n').length
        // TODO : move resizing to resize() function
        marketsBox.setSizeAndPosition({ x: 1, y: terminal.height / 2, width: terminal.width / 4, height: balanceHeight })
        balanceBox.setContent(balanceText)
    }

    resize()

    watchdog.on('initializing', function () {
        messageBox.setContent('loading...')
    })
    watchdog.on('initialized', function () {
        messageBox.setContent('')
        updateMarkets()
        updateBalance(watchdog.balance)
        drawMarkets()
        drawBalance()
    })
    watchdog.on('fetching', function (symbol) {
        messageBox.setContent(`fetching ${symbol} ...`)
    })
    watchdog.on('fetched', function (info) {
        messageBox.setContent(`fetching ${info.symbol} ...done`)
        updateMarkets(info)
        drawMarkets()
    })
    watchdog.on('pause', function (remaining) {
        messageBox.setContent(`pause - remaining time ${(remaining / 1000).toFixed(0)} ...`)
    })

    if (!watchdog.initialized) await watchdog.initialize()
    await watchdog.watch()

}

// *terminal events

function terminate() {
    terminal.moveTo(1, terminal.height - 1)
    terminal.grabInput(false)
    terminal.hideCursor(false)
    terminal.styleReset()
    terminal.processExit()
}

terminal.on('key', function (name) {
    switch (name) {
        case 'CTRL_C':
            terminate()
            break
    }
})

module.exports = {
    cliInfo,
    cliSearch,
    cliRemove,
    cliWatch,
    terminate,
    terminal
}