const { Command } = require('commander')
const termkit = require('../node_modules/terminal-kit/lib/termkit.js')
const terminal = termkit.terminal
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
    .description('search trading symbol(s)')
    .argument('key', 'key to search')
    .action(async function (key) {
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
            const select = await terminal.singleColumnMenu(items).promise
            await watchdog.save(select.selectedText)
            terminal(`\n${select.selectedText} saved...\n`)
        } else {
            terminal(`\nno markets found for: ${key}\n`)
        }
        terminate()
    })

program.parse()