const { Command } = require('commander')
const { cliInfo, cliSearch, cliRemove, terminate, terminal, cliWatch } = require('../src/cli.js')

const program = new Command

program
    .description('command line interface')
    .action(async function () {

        terminal(`COINDOG 1.0\n\n`)
        terminal.grabInput(true)

        let command = ''
        while (command !== 'exit') {
            terminal(`> `)
            let [command, ...args] = (await terminal.inputField().promise).split(' ')
            
            switch (command) {
                case 'info':
                    await cliInfo()

                    break

                case 'search':
                    let key = ''
                    if (!args.length) {
                        terminal(`please enter keyword > `)
                        key = await terminal.inputField().promise
                    } else {
                        key = args.shift()
                    }
                    terminal(`\n`)
                    await cliSearch(key)

                    break

                case 'remove':
                    await cliRemove()

                    break

                case 'watch':
                    await cliWatch()
                    break

                case 'exit':
                    terminate()
                    break

                default:
                    terminal(`\n${command}\n${args}\n`)
                    break

            }

        }

        terminate()

    })

program.parse()