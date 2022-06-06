const { Command } = require('commander')

const program = new Command

program
    .description('watch and trade crypto coins')
    .command('info', 'showing exchange info')
    .command('repl', 'read, eval, print, loop', { isDefault: true })
    .command('remove', 'remove a symbol from watch')
    .command('search', 'search trading symbol(s)')
    .command('watch', 'watch symbol(s) for buy and sell signals')

module.exports = {
    cli: async function (args) {
        args[1] = __filename // workaround for subcommands
        program.parse(args)
    }
}