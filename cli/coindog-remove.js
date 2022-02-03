const { Command } = require('commander')
const { BITFINEX } = require('../config/config.js')
const { Coindog } = require('../lib/Coindog.js')
const termkit = require('../node_modules/terminal-kit/lib/termkit.js')
const terminal = termkit.terminal

const watchdog = new Coindog(BITFINEX)
const program = new Command

function terminate() {
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
terminal.grabInput(true)

program
    .description('removing a symbol from watch')
    .argument('[symbol]', 'symbol to remove')
    .action(async function (symbol) {
        if (!symbol) {
            const items = watchdog.symbols.reduce(function (prev, curr) {
                prev.push(curr.symbol)
                return prev
            }, [])
            terminal(`select a symbol to remove:\n`)
            const select = await terminal.singleColumnMenu(items).promise
            symbol = select.selectedText
        }
        const result = await watchdog.remove(symbol)
        if (result) {
            terminal(`\n${result} removed...`)
        }
        terminate()
    })

program.parse()