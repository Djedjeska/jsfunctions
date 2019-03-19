let express = require('express');
let path = require('path');
let favicon = require('serve-favicon');
let logger = require('morgan');
let cookieParser = require('cookie-parser');
let bodyParser = require('body-parser');

/*
cd; cd Desktop/Projets/Gameloop;
supervisor -e .js,.css,.gdb app.js
*/

let app = express();
app.disable('etag');
app.use(express.static('public'));
app.use('/scripts', express.static(__dirname + '/node_modules/mainloop.js/src'));

let server = require('http').createServer(app);
let io = require('socket.io')(server);

//let fct = require('esbfunctions')(app);
let fct = require('./functions')(app);

console.log(__dirname + '/public/javascripts/server-mirror');
let sharedJSFiles = fct.shareJSFiles(['app.js', 'sockets.js']);
app.javascripts = Object.assign(fct.getJSFiles(), sharedJSFiles);
fct.getTemplates();

require('./sockets')(app, io, fct);

let index = require('./routes/index');

// view engine setup
app.engine('gdb', function (filePath, options, callback) {
	delete options.settings;
	delete options._locals;
	options['layout-page'] = path.basename(filePath).split('.gdb')[0].toLowerCase();
	fct.loadTemplate(path.basename(filePath), options, function(Template) {
		Template = fct.loadInfo(Template, options);
		return callback(null, Template);
	});
});

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'gdb');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/', index);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
	res.render('Pages/404', {});
});

// error handler
app.use(function(err, req, res, next) {
	// set locals, only providing error in development
	res.locals.message = err.message;
	res.locals.error = req.app.get('env') === 'development' ? err : {};

	// render the error page
	res.status(err.status || 500);

	let Stack = err.stack.split(' at ').join(' at<br><br>');
	Stack = Stack.replace(/:(\d+:\d+)/g, '<strong>$1</strong>');
	Stack = Stack.replace(/(\/[\w-\/]+(\.js|"))/g, '<span>$1</span>');

	res.render('Pages/Erreur', {
		message: err.message,
		statut: err.status || '',
		stack: Stack
	});
});

app.use(logger('dev'));

server.listen(process.env.PORT || 5000, function () {
	console.log('Serveur lancé.');
});

module.exports = app;
