const termkit = require('../../node_modules/terminal-kit/lib/termkit.js')
const terminal = termkit.terminal
const Table = require('easy-table')

class TableColors {
    static 'defaultColor' = 'defaultColor'
    static 'black' = 'black'
    static 'red' = 'red'
    static 'green' = 'green'
    static 'yellow' = 'yellow'
    static 'blue' = 'blue'
    static 'magenta' = 'magenta'
    static 'cyan' = 'cyan'
    static 'white' = 'white'
    static 'gray' = 'gray'
    static 'brightRed' = 'brightRed'
    static 'brightGreen' = 'brightGreen'
    static 'brightYellow' = 'brightYellow'
    static 'brightBlue' = 'brightBlue'
    static 'brightMagenta' = 'brightMagenta'
    static 'brightCyan' = 'brightCyan'
    static 'brightWhite' = 'brightWhite'
    static 'bgDefaultColor' = 'bgDefaultColor'
    static 'bgBlack' = 'bgBlack'
    static 'bgRed' = 'bgRed'
    static 'bgGreen' = 'bgGreen'
    static 'bgYellow' = 'bgYellow'
    static 'bgBlue' = 'bgBlue'
    static 'bgMagenta' = 'bgMagenta'
    static 'bgCyan' = 'bgCyan'
    static 'bgWhite' = 'bgWhite'
    static 'bgDarkColor' = 'bgDarkColor'
    static 'bgGray' = 'bgGray'
    static 'bgBrightRed' = 'bgBrightRed'
    static 'bgBrightGreen' = 'bgBrightGreen'
    static 'bgBrightYellow' = 'bgBrightYellow'
    static 'bgBrightBlue' = 'bgBrightBlue'
    static 'bgBrightMagenta' = 'bgBrightMagenta'
    static 'bgBrightCyan' = 'bgBrightCyan'
}

class TableStyle {
    constructor({ row, cell, color, bgColor } = {}) {
        this.row = row
        this.cell = cell
        this.color = color
        this.bgColor = bgColor
    }
}

class MarketsTable extends termkit.TextBox {
    constructor(options, { data = [] } = {}) {
        super(options)
        this.data = []
        this.styles = []
        if (data.length) this.update(data)
    }
    get headers() {
        if (this.data.length) return Object.keys(this.data[0])
        return []
    }
    get text() {
        return this.getContent()
    }
    set text(data) {
        this.setContent(data, 'legacyAnsi')
        return
    }
    applyStyle(style) {
        const sIdx = this.styles.findIndex(function (s) {
            return s.row === style.row && s.cell === style.cell
        })
        if (sIdx > -1) {
            this.styles[sIdx] = style
        } else {
            this.styles.push(style)
        }
        this.drawStyles()
    }
    drawStyles() {
        const self = this
        const text = Table.print(self.data).split('\n').map(function (line, index) {
            const styles = self.styles.reduce(function (styles, style) {
                if (style.row === index) styles.push(style)
                return styles
            }, [])
            if (styles.length) {
                const lineStyles = styles.reduce(function (lineStyles, style) {
                    if (!style.cell || style.cell === -1) lineStyles.push(style)
                    return lineStyles
                }, [])
                if (lineStyles.length) {
                    for (let lCnt = 0; lCnt < lineStyles.length; lCnt++) {
                        const { color, bgColor } = lineStyles[lCnt]
                        line = terminal[color][bgColor].str(line)
                    }
                }
                const cells = line.split(/\s+/).filter(c => !!c)
                const spaces = line.split(/\S+/).filter(s => !!s)
                terminal.moveTo(1, terminal.height - 10)
                terminal.eraseDisplayBelow()
                terminal.styleReset()
                console.log({ cells, spaces })
                for (let cCnt = 0; cCnt < cells.length; cCnt++) {
                    const cell = cells[cCnt]
                    const style = styles.find(s => s.cell === cCnt)
                    if (style) {
                        const { color, bgColor } = style
                        cells[cCnt] = terminal[color][bgColor].str(cell)
                    }
                }
                const applied = cells.reduce(function (text, cell, index) {
                    if (index <= spaces.length -1) {
                        text += `${cell}${spaces[index]}`
                    }
                    return text
                }, '')
                return `${applied}`
            }
            return `${line}`
        })
        this.text = text.join('\n')
    }
    update(data) {

        if (!data || !data.length) throw new Error('data must be set')
        if (!this.data.length) this.data = data

        // update rows
        for (let dCnt = 0; dCnt < data.length; dCnt++) {
            const market = data[dCnt]
            const mIdx = this.data.findIndex(m => m.symbol === market.symbol)
            if (mIdx > -1) {
                this.data[mIdx] = market
            } else {
                this.data.push(market)
            }
        }
        
    }
}

module.exports = { TableColors, TableStyle, MarketsTable }