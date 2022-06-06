const { Command } = require('commander')
const { cliInfo, terminate, terminal } = require('../src/cli.js')

const program = new Command

program
    .description('showing exchange info')
    .action(async function () {
        terminal.grabInput(true)
        await cliInfo()
        terminate()
    })

program.parse()