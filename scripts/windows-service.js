// Windows Script Host is a small GUI launcher. Keep the task supervising Node
// and propagate its exit status without opening a console on the user's desktop.
function quote(value) {
    return '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"';
}
var shell = new ActiveXObject('WScript.Shell');
shell.CurrentDirectory = WScript.Arguments(0);
var command = [];
for (var i = 1; i < WScript.Arguments.length; i++) command.push(quote(WScript.Arguments(i)));
WScript.Quit(shell.Run(command.join(' '), 0, true));
