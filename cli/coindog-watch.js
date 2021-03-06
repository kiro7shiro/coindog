const { Command } = require('commander')
const { cliWatch, terminate, terminal } = require('../src/cli.js')

const program = new Command

program
    .description('watch symbol(s) for buy or sell signals')
    .action(async function () {
        terminal.grabInput(true)
        await cliWatch()
        terminate()
    })

program.parse()