const { Command } = require('commander')
const { cliSearch, terminate, terminal } = require('../src/cli.js')

const program = new Command

program
    .description('search trading symbol(s)')
    .argument('key', 'key to search')
    .action(async function (key) {
        terminal.grabInput(true)
        await cliSearch(key)
        terminate()
    })

program.parse()