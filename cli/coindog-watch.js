const { Command } = require('commander')
const termkit = require('../node_modules/terminal-kit/lib/termkit.js')
const terminal = termkit.terminal

const program = new Command

program
    .description('watch symbol(s) for buy or sell signals')

program.parse()