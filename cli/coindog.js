const { BITFINEX } = require('../config/config.js')
const { Command } = require('commander')
const ccxt = require('ccxt')

const program = new Command

program
    .description('watch and trade crypto coins')
    .command('search', 'search for coins on your exchange')
    .command('watch', 'watch symbol(s) for buy and sell signals', { isDefault: true })

module.exports = {
    cli: async function (args) {
        args[1] = __filename // workaround for subcommands
        program.parse(args)
    }
}