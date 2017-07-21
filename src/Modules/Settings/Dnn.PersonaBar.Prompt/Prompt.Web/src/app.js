var css = require('../css/Prompt.css');
const Cookies = require('./js-cookie');

import PaginationService from "./pagination-service";
let paginationService = null


class DnnPrompt {
    constructor(vsn, wrapper, util, params) {
        paginationService = new PaginationService(this);
        const self = this;

        self.version = vsn;
        self.util = util;
        self.wrapper = wrapper;
        self.params = params;
        self.tabId = null;
        self.history = []; // Command history
        // restore history if it exists
        if (sessionStorage) {
            if (sessionStorage.getItem('dnn-prompt-console-history')) {
                self.history = JSON.parse(sessionStorage.getItem('dnn-prompt-console-history'));
            }
        }
        self.cmdOffset = 0; // reverse offset into history

        self.createElements();
        self.wireEvents();
        self.showGreeting();
        self.busy(false);
        self.focus();
        self.getCommands();
    }

    wireEvents() {
        const self = this;

        self.isDragging = false;

        // intermediary functions so that 'this' points to class and not event source
        self.keyDownHandler = function (e) {
            self.onKeyDown(e);
        };
        self.clickHandler = function (e) {
            self.onClickHandler(e);
        };
        self.mouseDownHandler = function (e) {
            self.onMouseDownHandler(e);
        };
        self.mouseUpHandler = function (e) {
            self.onMouseUpHandler(e);
        }

        // register on parent doc so panel can be loaded with keypress combo
        window.parent.document.addEventListener('keydown', self.keyDownHandler);
        document.addEventListener('keydown', self.keyDownHandler);
        self.ctrlEl.addEventListener('mousedown', self.mouseDownHandler);
        self.ctrlEl.addEventListener('mouseup', self.mouseUpHandler);
        self.ctrlEl.addEventListener('click', self.clickHandler);
    }

    onMouseDownHandler(e) {
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
    }
    onMouseUpHandler(e) {
        if (Math.abs(this.mouseX - e.clientX) > 10 || Math.abs(this.mouseY - e.clientY) > 5) {
            this.isDragging = true;
        } else {
            this.isDragging = false;
        }
    }
    onClickHandler(e) {
        if (this.isDragging) return;
        if (e.target.classList.contains("dnn-prompt-cmd-insert")) {
            // insert command and set focus
            this.inputEl.value = e.target.dataset.cmd.replace(/'/g, '"');
            this.inputEl.focus();
        } else {
            this.focus();
        }
    }

    onKeyDown(e) {

        const left = () => {
            paginationService.nextPage()
        }

        const right = () => {
            const self = this;
            // CTRL + `
            if (e.ctrlKey && e.keyCode === 192) {
                if (self.wrapper[0].offsetLeft <= 0) {
                    self.util.loadPanel("Dnn.Prompt", {
                        moduleName: "Dnn.Prompt",
                        folderName: "",
                        identifier: "Dnn.Prompt",
                        path: "Prompt"
                    });
                } else {
                    self.util.closePersonaBar();
                }
                return;
            }

            if (self.isBusy) return;

            // All other keys, only trap if focus is in console.
            if (self.inputEl === document.activeElement) {
                switch (e.keyCode) {
                    case 13: // enter key
                        return self.runCmd();
                    case 38: // Up arrow
                        if ((self.history.length + self.cmdOffset > 0)) {
                            self.cmdOffset--;
                            self.inputEl.value = self.history[self.history.length + self.cmdOffset];
                            e.preventDefault();
                        }
                        break;
                    case 40: // Down arrow
                        if ((self.cmdOffset < -1)) {
                            self.cmdOffset++;
                            self.inputEl.value = self.history[self.history.length + self.cmdOffset];
                            e.preventDefault();
                        }
                        break;
                }
            }
        }

        paginationService.shouldPaginate ? left() : right();
    }

    runCmd(command) {
        const self = this;
        const txt = (command) ? command : self.inputEl.value.trim()

        if (!self.tabId) {
            self.tabId = dnn.getVar("sf_tabId");
        }

        self.cmdOffset = 0; // reset history index
        self.inputEl.value = ""; // clearn input for future commands.
        self.writeLine(txt, "cmd"); // Write cmd to output
        if (txt === "") {
            return;
        } // don't process if cmd is emtpy
        self.history.push(txt); // Add cmd to history
        if (sessionStorage) {
            sessionStorage.setItem('dnn-prompt-console-history', JSON.stringify(self.history));
        }

        // Client Command
        const tokens = txt.split(" "),
            cmd = tokens[0].toUpperCase();

        if (cmd === "CLS" || cmd === "CLEAR-SCREEN") {
            self.outputEl.innerHTML = "";
            return;
        }
        if (cmd === "EXIT") {
            this.util.closePersonaBar();
            return;
        }
        if (cmd === "HELP") {
            self.renderHelp(tokens);
            return;
        }
        if (cmd === "CONFIG") {
            self.configConsole(tokens);
            return;
        }
        if (cmd === "CLH" || cmd === "CLEAR-HISTORY") {
            self.history = [];
            sessionStorage.removeItem('dnn-prompt-console-history');
            self.writeLine("Session command history cleared");
            return;
        }
        if (cmd === "SET-MODE") {
            self.changeUserMode(tokens);
            return;
        }
        // using if/else to allow reload if hash in URL and also prevent 'syntax invalid' message;
        if (cmd === "RELOAD") {
            window.top.location.reload(true);
        } else {
            // Server Command
            self.busy(true);
            // special handling for 'goto' command
            let bRedirect = false;
            if (cmd === "GOTO") {
                bRedirect = true;
            }

            const afVal = this.util.sf.antiForgeryToken;

            let path = 'API/PersonaBar/Command/Cmd';
            if (this.util.sf) {
                path = this.util.sf.getSiteRoot() + path
            } else {
                path = '/' + path
            }

            fetch(path, {
                method: 'post',
                headers: new Headers({
                    'Content-Type': 'application/json',
                    'RequestVerificationToken': afVal
                }),
                credentials: 'include',
                body: JSON.stringify({ cmdLine: txt, currentPage: self.tabId })
            })
                .then(function (response) {
                    return response.json();
                })
                .then(function (result) {
                    paginationService.isPaginationRequired(result)

                    if (result.Message) {
                        // dnn web api error
                        result.output = result.Message;
                        result.isError = true;
                    }
                    const output = result.output;
                    const style = result.isError ? "error" : "ok";
                    const data = result.data;
                    let fieldOrder = result.fieldOrder;
                    if (typeof fieldOrder === 'undefined' || !fieldOrder || fieldOrder.length === 0) {
                        fieldOrder = null;
                    }

                    if (bRedirect) {
                        window.top.location.href = output;
                    } else {
                        if (data) {
                            var html = self.renderData(data, fieldOrder);
                            self.writeHtml(html);
                            if (output) { self.writeLine(output); }
                        } else if (result.isHtml) {
                            self.writeHtml(output);
                        } else {
                            self.writeLine(output, style);
                        }
                    }

                    if (result.mustReload) {
                        self.writeHtml('<div class="dnn-prompt-ok"><strong>Reloading in 3 seconds</strong></div>');
                        setTimeout(() => location.reload(true), 3000);
                    }
                })
                .catch(function (err) {
                    console.log('err', err);
                    self.writeLine("Error sending request to server", "error")
                })
                .then(function () {
                    // finally
                    self.busy(false);
                    self.focus();
                });

            self.inputEl.blur(); // remove focus from input elment
        }

    }

    getCommands() {
        const self = this;
        let path = 'API/PersonaBar/Command/List';
        if (this.util.sf) {
            path = this.util.sf.getSiteRoot() + path
        } else {
            path = '/' + path
        }

        fetch(path, {
            method: 'get',
            credentials: 'include'
        })
            .then(function (response) {
                return response.json();
            })
            .then(function (result) {
                self.commands = result;
            })
    }

    focus() {
        this.inputEl.focus();
    }

    scrollToBottom() {
        this.ctrlEl.scrollTop = this.ctrlEl.scrollHeight;
    }

    newLine() {
        this.outputEl.appendChild(document.createElement('br'));
        this.scrollToBottom();
    }

    writeLine(txt, cssSuffix) {
        let messages = txt.split(/\\n/);
        messages = messages.map((m) => {
            const p = document.createElement("p");
            p.innerText = m;
            return p
        });

        let span = document.createElement('span');
        cssSuffix = cssSuffix || 'ok';
        span.className = 'dnn-prompt-' + cssSuffix;

        messages.forEach((el) => {
            span.appendChild(el)
        });

        this.outputEl.appendChild(span);
        this.newLine();
    }

    writeHtml(markup) {
        let div = document.createElement('div');
        div.innerHTML = markup;
        this.outputEl.appendChild(div);
        this.newLine();
    }

    renderData(data, fieldOrder) {
        console.log('renderData::fieldOrder', fieldOrder);
        if (data.length > 1) {
            return this.renderTable(data, fieldOrder);
        } else if (data.length == 1) {
            return this.renderObject(data[0], fieldOrder);
        }
        return "";
    }

    renderTable(rows, fieldOrder) {
        if (!rows || !rows.length) { return; }
        const linkFields = this.extractLinkFields(rows[0]);

        var columns = fieldOrder;
        if (!columns || !columns.length) {
            // get columns from first row
            columns = [];
            const row = rows[0];
            for (var key in row) {
                if (!key.startsWith("__")) {
                    columns.push(key);
                }
            }
        }

        // build header
        var out = '<table class="dnn-prompt-tbl"><thead><tr>';
        for (let col in columns) {
           let lbl = this.formatLabel(columns[col]);
           out += `<th>${lbl}</th>`;
        }
        out += '</tr></thead><tbody>';

        // build rows
        for (let i = 0; i < rows.length; i++) {
            let row = rows[i];
            out += '<tr>';
            // only use specified columns
            for (let fld in columns) {
                let fldName = columns[fld];
                let fldVal = row[fldName] ? row[fldName] : '';
                let cmd = row["__" + fldName] ? row["__" + fldName] : null;
                if (cmd) {
                    out += `<td><a href="#" class="dnn-prompt-cmd-insert" data-cmd="${cmd}" title="${cmd.replace(/'/g, '&quot;')}">${fldVal}</a></td>`;
                } else {
                    out += `<td> ${fldVal}</td>`;
                }
            }
            out += '</tr>'
        }
        out += '</tbody></table>'
        return out;
    }

    renderObject(data, fieldOrder) {
        const linkFields = this.extractLinkFields(data);
        var columns = fieldOrder;
        if (!columns || !columns.length) {
            // no field order. Generate it
            columns = [];
            for (let key in data) {
                if (!key.startsWith("__")) {
                    columns.push(key);
                }
            }
        }
        let out = '<table class="dnn-prompt-tbl">'
        for (let fld in columns) {
            let fldName = columns[fld];
            let lbl = this.formatLabel(fldName);
            let fldVal = data[fldName] ? data[fldName] : '';
            let cmd = data["__" + fldName] ? data["__" + fldName] : null;

            if (cmd) {
                out += `<tr><td class="dnn-prompt-lbl">${lbl}</td><td>:</td><td><a href="#" class="dnn-prompt-cmd-insert" data-cmd="${cmd}" title="${cmd.replace(/'/g, '&quot;')}">${fldVal}</a></td></tr>`;
            } else {
                out += `<tr><td class="dnn-prompt-lbl">${lbl}</td><td>:</td><td>${fldVal}</td></tr>`;
            }

        }
        out += '</table>';
        return out;
    }

    formatLabel(input) {
        // format camelcase and remove Is from labels
        let output = input.replace(/^(Is)(.+)/i, "$2");
        output = output.match(/[A-Z][a-z]+/g).join(" "); // rudimentary but should handle normal Camelcase
        return output;
    }

    renderHelp(tokens) {
        const self = this;
        let path = 'DesktopModules/Admin/Dnn.PersonaBar/Modules/Dnn.Prompt/help/'
        if (!tokens || tokens.length == 1) {
            // render list of help commands
            path += 'index.html';
        } else {
            path += tokens[1] + '.html';
        }

        if (this.util.sf) {
            path = this.util.sf.getSiteRoot() + path
        } else {
            path = '/' + path
        }
        self.busy(true);
        fetch(path, {
            method: 'get',
            headers: new Headers({
                'Content-Type': 'text/html',
            }),
            credentials: 'include',
        })
            .then(function (response) {
                if (response.status == 200) { return response.text(); }
                return '<div class="dnn-prompt-error">Unable to find help for that command</div>';
            })
            .then(function (html) {
                self.writeHtml(html);
            })
            .catch(function () {
                self.writeLine("Error sending request to server", "error")
            })
            .then(function () {
                // finally
                self.busy(false);
                self.focus();
            });

    }

    showGreeting() {
        this.writeLine('Prompt [' + this.version + '] Type \'help\' to get a list of commands', 'cmd');
        this.newLine();
    }
    extractLinkFields(row) {
        let linkFields = [];
        if (!row || !row.length) { return linkFields; }

        // find any command link fields
        for (var fld in row) {
            if (fld.startsWith("__")) {
                linkFields.push(fld.slice(2));
            }
        }
        return linkFields;
    }


    createElements() {
        const self = this;
        const doc = document;

        // Create and store CLI elements
        self.ctrlEl = doc.getElementById("prompt"); //CLI control outer frame
        self.outputEl = doc.createElement("div"); //div holding cosole output
        self.inputElWrapper = doc.createElement("div"); // div holding the input control
        self.inputEl = doc.createElement("input"); //Input control
        self.busyEl = doc.createElement("div"); // Indicate busy/loading


        // Add CSS
        self.ctrlEl.className = "dnn-prompt";
        self.outputEl.className = "dnn-prompt-output";
        self.inputElWrapper.className = "dnn-prompt-input-wrapper";
        self.inputEl.className = "dnn-prompt-input";
        self.busyEl.className = "dnn-prompt-busy"

        self.inputEl.setAttribute("spellcheck", "false");

        // Assemble HTML
        self.ctrlEl.appendChild(self.outputEl);
        self.inputElWrapper.appendChild(self.inputEl);
        self.ctrlEl.appendChild(self.inputElWrapper);
        self.ctrlEl.appendChild(self.busyEl);

        self.ctrlEl.style.display = "block";

        const consoleHeight = Cookies.get("dnn-prompt-console-height");
        if (consoleHeight) {
            self.configConsole(['config', consoleHeight]);
        }
    }

    busy(b) {
        this.isBusy = b;
        this.busyEl.style.display = b ? "block" : "none";
        this.inputEl.style.display = b ? "none" : "inline-block";
    }

    isFlag(token) {
        return (token && token.startsWith('--'));
    }

    getFlag(flag, tokens) {
        let token = null;
        if (!tokens || tokens.length) {
            return null;
        }
        for (let i = 1; i < tokens.length; i++) {
            token = tokens[i];
            // did we find the flag name?
            if (this.isFlag(token) && (token.toUpperCase() === flag.toUpperCase())) {
                // is there a value to be had?
                if ((i + 1) < tokens.length) {
                    if (!this.isFlag(tokens[i + 1])) {
                        return tokens[i + 1];
                    } else {
                        // next token is a flag and not a value. return nothing.
                        return null;
                    }
                } else {
                    // found but no value
                    return null;
                }
            }
        }
        // not found
        return null;
    }

    hasFlag(flag, tokens) {
        if (!tokens || tokens.length) return false;
        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].toUpperCase === flag.toUpperCase()) {
                return true;
            }
        }
        return false;
    }

    // client commands
    configConsole(tokens) {
        let height = null;
        if (this.hasFlag("--height")) {
            height = this.getFlag("--height", tokens);
        } else if (!this.isFlag(tokens[1])) {
            height = tokens[1];
        }

        if (height) {
            this.ctrlEl.style.height = height;
            Cookies.set("dnn-prompt-console-height", height)
        }
    }

    changeUserMode(tokens) {
        if (!tokens && tokens.length >= 2) {
            return;
        }
        let mode = null;
        if (this.hasFlag("--mode")) {
            mode = this.getFlag("--mode", tokens);
        } else if (!this.isFlag(tokens[1])) {
            mode = tokens[1];
        }
        if (mode) {
            const service = dnn.controlBar.getService();
            const serviceUrl = dnn.controlBar.getServiceUrl(service);
            $.ajax({
                url: serviceUrl + 'ToggleUserMode',
                type: 'POST',
                data: { UserMode: mode },
                beforeSend: service.setModuleHeaders,
                success: function () {
                    window.location.href = window.location.href;
                },
                error: function (xhr) {
                    dnn.controlBar.responseError(xhr);
                }
            });
        }
    }
}

window.DnnPrompt = DnnPrompt;


//# sourceURL=prompt-app.js