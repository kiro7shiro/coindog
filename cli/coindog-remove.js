const { Command } = require('commander')
const { cliRemove, terminate, terminal } = require('../src/cli.js')

const program = new Command

program
    .description('removing a symbol from watch')
    .argument('[symbol]', 'symbol to remove')
    .action(async function (symbol) {
        terminal.grabInput(true)
        await cliRemove(symbol)
        terminate()
    })

program.parse()