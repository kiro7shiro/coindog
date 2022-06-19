const _lang = require('lodash/lang')
const _obj = require('lodash/object')
const termkit = require('terminal-kit')
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

    static isCellStyle = function (style) {
        return style.row > -1 && style.cell > -1
    }

    static isLineStyle = function (style) {
        return style.row > -1 && (typeof style.cell === 'undefined' || style.cell < 0)
    }

    constructor({ row, cell, color, bgColor, formatter } = {}) {
        this.row = row
        this.cell = cell
        this.color = color
        this.bgColor = bgColor
        this.formatter = formatter
    }

    isEqual(style) {
        if (TableStyle.isLineStyle(this) && TableStyle.isLineStyle(style)) {
            return this.row === style.row &&
                this.color === style.color &&
                this.bgColor === style.bgColor
        }
        if (TableStyle.isLineStyle(this)) return false
        return this.row === style.row &&
            this.cell === style.cell &&
            this.color === style.color &&
            this.bgColor === style.bgColor
    }
}

class MarketsTable extends termkit.TextBox {
    constructor(options, { data = [], headers = [] } = {}) {
        super(options)
        this.data = []
        this.headers = headers
        this.styles = []
        this.lineStyles = []
        this.cellStyles = []
        if (data.length) this.update(data)
    }
    get text() {
        return this.getContent()
    }
    set text(data) {
        this.setContent(data, 'legacyAnsi')
        return
    }
    applyStyle(style) {
        if (TableStyle.isLineStyle(style)) {
            const lsIdx = this.lineStyles.findIndex(l => l.isEqual(style))
            if (lsIdx > -1) {
                this.lineStyles[lsIdx] = style
            } else {
                this.lineStyles.push(style)
            }
        } else {
            const csIdx = this.cellStyles.findIndex(s => s.cell === style.cell && s.row === style.row)
            if (csIdx > -1) {
                this.cellStyles[csIdx] = style
            } else {
                this.cellStyles.push(style)
            }
        }
        this.drawStyles()
    }
    drawStyles() {
        const self = this
        const text = Table.print(self.data).split('\n').map(function (line, index) {

            const lineStyles = self.lineStyles.reduce(function (lineStyles, style) {
                if (style.row === index) lineStyles.push(style)
                return lineStyles
            }, [])
            const cellStyles = self.cellStyles.reduce(function (cellStyles, style) {
                if (style.row === index) cellStyles.push(style)
                return cellStyles
            }, [])

            const cells = line.split(/\s+/).filter(c => !!c)
            const spaces = line.split(/\S+/).filter(s => !!s)

            switch (true) {
                // apply only line styles
                case (lineStyles.length > 0 && cellStyles.length < 1):
                    for (let lCnt = 0; lCnt < lineStyles.length; lCnt++) {
                        const { color, bgColor } = lineStyles[lCnt]
                        line = terminal[color][bgColor].str(line)
                    }
                    return `${line}`

                case (cellStyles.length > 0 && lineStyles.length > 0):
                    // apply space styles
                    for (let lsCnt = 0; lsCnt < lineStyles.length; lsCnt++) {
                        const { color, bgColor } = lineStyles[lsCnt]
                        for (let sCnt = 0; sCnt < spaces.length; sCnt++) {
                            const space = spaces[sCnt]
                            spaces[sCnt] = terminal[color][bgColor].str(space)
                        }
                        // check for cells without style
                        const noStyle = cells.reduce(function (noStyle, cell, index) {
                            const sIdx = cellStyles.findIndex(s => s.cell === index)
                            if (sIdx < 0) noStyle.push({ cell, index })
                            return noStyle
                        }, [])
                        if (noStyle.length) {
                            for (let noCnt = 0; noCnt < noStyle.length; noCnt++) {
                                const { cell, index } = noStyle[noCnt]
                                cells[index] = terminal[color][bgColor].str(cell)
                            }
                        }
                    }

                case cellStyles.length > 0:
                    // apply cell styles
                    for (let csCnt = 0; csCnt < cellStyles.length; csCnt++) {
                        const cellStyle = cellStyles[csCnt]
                        const { color, bgColor } = cellStyle
                        const cell = cells[cellStyle.cell]
                        const space = spaces[cellStyle.cell]
                        cells[cellStyle.cell] = terminal[color][bgColor].str(cell)
                        spaces[cellStyle.cell] = terminal[color][bgColor].str(space)
                    }
                    const applied = cells.reduce(function (text, cell, index) {
                        text += `${cell}${spaces[index]}`
                        return text
                    }, '')
                    return `${applied}`

                default:
                    return `${line}`

            }

        })
        this.text = text.join('\n')
    }
    removeStyle(style) {
        if (TableStyle.isLineStyle(style)) {
            const lsIdx = this.lineStyles.findIndex(l => l.isEqual(style))
            if (lsIdx > -1) {
                this.lineStyles.splice(lsIdx, 1)
            } 
        } else {
            const csIdx = this.cellStyles.findIndex(s => s.isEqual(style))
            if (csIdx > -1) {
                this.cellStyles.splice(csIdx, 1)
            } 
        }
        this.drawStyles()
    }
    update(data) {

        if (!data || !data.length) return

        // update rows
        for (let dCnt = 0; dCnt < data.length; dCnt++) {
            const market = data[dCnt]
            const mIdx = this.data.findIndex(m => m.symbol === market.symbol)
            if (mIdx > -1) {
                let updated = Object.assign({}, this.data[mIdx], market)
                if (this.headers.length) updated = _obj.pick(updated, this.headers)
                this.data[mIdx] = updated
            } else {
                this.data.push(market)
            }
        }

    }
}

module.exports = { TableColors, TableStyle, MarketsTable }