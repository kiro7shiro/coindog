const { Command } = require('commander')
const termkit = require('../node_modules/terminal-kit/lib/termkit.js')
const terminal = termkit.terminal
const Table = require('easy-table')
const credentials = require('../credentials/credentials.json')
const { Coindog } = require('../src/Coindog.js')

const watchdog = new Coindog(credentials.BITFINEX)
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
    .description('watch symbol(s) for buy or sell signals')
    .action(async function () {
        await watchdog.watch()
        //terminate()
    })

program.parse()