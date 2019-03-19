
module.exports = function(app) {
	let fs = require('fs');
	let jsonfile = require('jsonfile');
	app.extension = app.templatesExtension || '.gdb';
	app.uniqId = 0;
	app.Listes = {};
	app.templates = {};
	app.mainColor = 1;
	app.lastColor = '';

	let getImages = function(dir = 'public/images') {
		let images = {};
		checkFolder(dir);

		let files = fs.readdirSync(dir);
		files.forEach(function(file) {
			if (file.indexOf('DS_Store') > -1 || !fs.lstatSync(dir + '/' + file).isFile()) return;
			let type = file.split('-')[0];
			images[type] = images[type] || [];
			let match; let info = {};
			let reg = /(\w+)=(\w+)/g;
			while (match = reg.exec(file))
				info[match[1]] = !isNaN(match[2]) ? parseFloat(match[2]) : match[2];
			info.category = type;
			images[type].push([file, info]);
			images[file] = [file, info];
		});
		return images;
	};

	let getTemplates = function(dir = 'views') {
		let templates = {};
		let files = fs.readdirSync(dir);
		files.forEach(function(file) {
			if (file.indexOf(app.extension) > -1)
				templates[file] = fs.readFileSync(dir + '/' + file, 'UTF8');
			//Sous-dossiers
			else if (file.indexOf('.') === -1) {
				templates = Object.assign(templates, getTemplates(dir + '/' + file));
			}
		});
		app.templates = templates;
		return templates;
	};

	let getJSFiles = function(dir = 'public/javascripts', excluded = []) {
		excluded = excluded.concat(['js-cookie.js', 'jquery-min.js', 'mainloop.js']);
		let jsfiles = [];
		let files = fs.readdirSync(dir);
		files.forEach(function(file) {
			if (file.indexOf('.json') === -1 && file.indexOf('.js') > -1 && excluded.indexOf(file) === -1)
				jsfiles.push('<script type="text/javascript" src="/' + dir.replace('public/', '') + '/' + file + '"></script>');
		});
		return jsfiles;
	};

	//Création des fichiers miroir
	let shareJSFiles = function(excluded = [], basedir) {
		if (basedir) {
			excluded = excluded.concat(['app.js', 'functions.js', 'sockets.js']);
			checkFolder(basedir + '/public/javascripts/server-mirror');
			let jsfiles = [];
			let files = fs.readdirSync(basedir);

			files.forEach(function (file) {
				if (file.indexOf('.json') === -1 && file.indexOf('.js') > -1 && excluded.indexOf(file) === -1) {
					let content = fs.readFileSync(file).toString();
					let reg = /module\.exports.*{([^]*)return/;
					let regexec = reg.exec(content) || ['', ''];
					content = '(function(exports){\n\n' + regexec[1];
					reg = /let ([^\*\n]*) = function/g;
					let match;
					while (match = reg.exec(content)) {
						content += 'exports.' + match[1] + ' = ' + match[1] + ';\n\t';
					}
					content = content.replace(/(let [^\*\n]* = require.*;)/g, '//$1');
					content = content.replace(/([^\n]*io.sockets[^\*\n]*;)/g, '//$1');
					content = content.replace(/([^\n]*socket.emit[^\*\n]*;)/g, '//$1');
					content += '\n})(typeof exports === \'undefined\'? this[\'' + file.replace('.js', '') + 'f\']={}: exports);';
					fs.writeFileSync(basedir + '/public/javascripts/server-mirror/' + file.replace(/\.js/g, '-c.js'), content);
					//Préparation des scripts client
					jsfiles.push('<script type="text/javascript" src="/javascripts/server-mirror/' + file + '"></script>');
				}
			});
			return jsfiles;
		}
	};


	let loadTemplate = function(template, options, callback) {
		template = template.indexOf(app.extension) > -1 ? template : template + app.extension;
		let content = app.templates[template];
		if (!content) {
			if (callback) return callback('Template "' + template + '" introuvable.');
			return 'Template "' + template + '" introuvable.';
		}
		let safeLoop = 0;
		while(safeLoop === 0 || content.indexOf('.' + app.extension + ']]') > -1) {
			safeLoop++;
			if (safeLoop > 100) {
				log('Boucle infinie', "\n", content); break;
			}
			//Récupération des variables contenues dans le fichier
			let reg = /§([^=]*)=([^§]*)§/g; let match;
			while (match = reg.exec(content)) {
				options[match[1].toLowerCase()] = match[2];
				content = content.replace(match[0], '');
				match = reg.exec(template);
			}
			//Remplacement des sous-templates
			reg = new RegExp('\\[\\[(.*?\\' + app.extension + ')]]', 'g');
			content = content.replace(reg, function (match, fichier) {
				if (fichier === 'layout' + app.extension)
					options['layout-javascripts'] = app.javascripts.join("\n");
				let content2 = app.templates[fichier];
				//Préfixage des variables
				content2 = content2.replace(/\[\[([^.]*?)]]/g, function (match, variable) {
					variable = variable.toLowerCase();
					return '[[' + fichier.replace(app.extension, '') + '-' + variable + ']]';
				});
				return replaceVariables(content2, options);
			});
			//Remplacement des variables
			content = replaceVariables(content, options);
		}
		if (callback) return callback(content);
		return content;
	};

	function replaceVariables(chaine, options) {
		//Récupération des variables contenues dans la chaîne
		let reg = /§([^=]*)=([^§]*)§/g;
		let match;
		while (match = reg.exec(chaine)) {
			options[match[1].toLowerCase()] = match[2];
			chaine = chaine.replace(match[0], '');
			match = reg.exec(chaine);
		}
		//Remplacement des variables dans la chaîne
		return chaine.replace(/\[\[(.*?)]]/g, function (match, variable) {
			//Listes
			if (variable.substring(0, 6).toLowerCase() === 'liste.') {
				let NomListe = variable.substring(6, variable.length);
				let Liste = options.Listes ? options.Listes[NomListe] : null;
				Liste = Liste || Listes[NomListe];
				if (!Liste){
					return 'Liste "' + NomListe + '" non préparée.';
				}
				else if (typeof Liste === 'object') {
					let Options = [];
					Options.push('<option value="">Non défini</option>');
					let Info = 'ID' + NomListe;
					for (let i = 0; i < Liste.length; i++) {
						let Valeur, Texte;
						if (typeof Liste[i] === 'object') {
							Valeur = Liste[i].ID;
							Texte = Liste[i].Nom;
						}
						else {
							Valeur = Liste[i];
							Texte = Liste[i];
						}
						if (Texte && Texte.indexOf('---') > -1) {
							Options.push('<option disabled="disabled">' + (Texte === '---' ? '' : Texte) + '</option>');
						}
						else {
							Options.push('<option value="' + Valeur + '">' + Texte + '</option>');
						}
					}
					return '<select data-info="' + Info + '">' + Options.join('') + '</select>';
				}
				else {
					return Liste;
				}
			}
			//Tableaux
			else if (variable.substring(0, 8).toLowerCase() === 'tableau.') {
				let Split = variable.split('.');
				let NomTableau = Split[1];
				let NomTemplate = app.templates[Split[2] + app.extension] ? Split[2] + app.extension : 'SingleElement.gdb';
				let SingleTemplate = app.templates[Split[2] + app.extension] || templates['SingleElement' + app.extension];
				let Tableau = options.Listes ? options.Listes[NomTableau] : null;
				Tableau = Tableau || Listes[NomTableau];
				if (!Tableau) {
					return 'Liste "' + NomTableau + '" non préparée.';
				}
				else {
					Tableau.sort(function(a, b) {
						return new Date(b.DateMAJ) - new Date(a.DateMAJ);
					});
					let SingleElements = [];
					for (let i = 0; i < Tableau.length; i++) {
						SingleElements.push(loadTemplate(NomTemplate, Tableau[i]));
					}
					return SingleElements.join('');
				}
			}
			//Autres variables
			else if (variable.indexOf('.') === -1) {
				variable = variable.toLowerCase();
				if (variable === 'uniqid') {
					return IDUnique();
				}
				let valeur;
				for (let key in options) {
					if (key.toLowerCase() === variable) {
						valeur = options[key];
						break;
					}
				}
				if (valeur !== undefined) {
					//Objets
					if (valeur !== null && typeof valeur === 'object') {
						let SousItems = '';
						for (let i = 0, len = valeur.length; i < len; i++) {
							let SousItem = valeur[i];
							if (!SousItem.Template) {
								SousItems += 'Template non définie.';
							}
							else {
								SousItems += chargerTemplate(SousItem.Template, SousItem);
							}
						}
						return SousItems;
					}
					else
						return valeur;
				}
				//Variables auto
				else if (variable.toLowerCase() === 'data') {
					if (options['DateMAJ']) {
						options['DateMAJ'] = options['DateMAJ'].toString();
						//options['DateMAJ'] = dateUS(options['DateMAJ']);
					}
					let Data = '';
					for (let key in options) {
						if (typeof options[key] !== 'object' && options[key].toString().indexOf('[[') === -1)
							Data += 'data-' + key.toLowerCase() + '="' + options[key].toString().replace(/"/g, "'") + '" ';
					}
					return Data;
				}
				//Variable introuvable
				else {
					log('Variable introuvable : ' + variable);
					return '<div class="div-erreur">Variable introuvable : ' + variable + '<br>Variables envoyées :<br>' + beautifyString(JSON.stringify(options).replace(/\[\[/g, '[')) + '</div>';
					//return '<div class="div-erreur">Variable introuvable : ' + variable + '<br><br>Chaîne :<br><br><textarea>' + htmlEntities(chaine) + '</textarea><br><br>Options :<br><br>' + JSON.stringify(options) + '</div>';
				}
			}
			//Sous-templates
			else {
				return '[[' + variable + ']]';
			}
		});
	}

	let checkFolder = function(path) {
		if (!fs.existsSync(path)) {
			fs.mkdirSync(path);
			log('Dossier "' + path + '" créé automatiquement.');
		}
	};

	let checkFile = function(path) {
		if (!fs.existsSync(path)) {
			fs.writeFileSync(path, '{}');
			log('Fichier "' + path + '" créé automatiquement.');
		}
	};

	let loadInfo = function(chaine, options) {
		chaine = chaine.replace(/<input type="(?:text|hidden)"[^>]+data-info="(\w+)"/g, function (match, info) {
			return match + ' value="' + (options[info] === undefined ? '' : options[info]) + '"';
		}).replace(/<input type="(?:text|hidden)"[^>]+data-defaut="(\w+)"/g, function (match, info) {
			return match + ' value="' + info + '"';
		}).replace(/<textarea[^>]+data-info="(\w+)"[^>]*>/g, function (match, info) {
			return match + (options[info] === undefined ? '' : options[info]);
		}).replace(/<textarea[^>]+data-defaut="(\w+)"[^>]*>/g, function (match, info) {
			return match + info;
		}).replace(/<select[^>]+data-info="(\w+)"[^>]*>(.*?)<\/select>/g, function (match, info, contenu) {
			if (options[info]) {
				let Reg = new RegExp('<option[^>]+value="' + options[info] + '"[^>]*', 'g');
				let contenu2 = contenu.replace(Reg, function(match2) {
					return match2 + ' selected="selected"';
				});
				return match.replace(contenu, contenu2);
			}
			else {
				return match;
			}
		}).replace(/(<input type="file"[^>]*>)/g, '<label class="fileContainer bleu">Parcourir...$1</label>');

		return chaine;
	};


	let getJSONData = function(path) {
		let jsondata = {};
		let files = fs.readdirSync(path);
		files.forEach(function(file) {
			if (file.indexOf('.json') > -1) {
				let filename = file.replace('.json', '');
				jsondata[filename] = jsonfile.readFileSync(path + '/' + file);
			}
		});
		return jsondata;
	};

	let htmlEntities = function (str) {
		return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	};

	let beautifyString = function(str) {
		if (typeof str === 'string') {
			//Objets
			str = str.replace(/{/g, '<div style="display: block;">{</div><div class="mefstring-div">');
			str = str.replace(/}/g, '</div><div style="display: block;">}</div>');
			//Nombres
			str = str.replace(/("[\w\-#]+":)("[\d.\-]+")(,?)/g, '<span class="mefstring-label">$1</span><span class="style-cs-101">$2</span>$3<br>');
			str = str.replace(/("[\w\-#]+":)([\d.\-]+)(,?)/g, '<span class="mefstring-label">$1</span><span class="style-cs-101">$2</span>$3<br>');
			//Textes
			str = str.replace(/("[\w\-#]+":)("(?:[^"\\<>]|\\.)*")(,?)/g, '<span class="mefstring-label">$1</span><span class="style-cs-2">$2</span>$3<br>');
			//Null ou false ou [] ou {}
			str = str.replace(/("[\w\-#]+":)(null|false|\[]|{})(,?)/g, '<span class="mefstring-label">$1</span><span class="style-cs-1">$2</span>$3<br>');
		}

		return str;
	};

	let uniqId = function(ID = '') {
		app.uniqId++;
		let MaDate = new Date();
		let MyTime = MaDate.getTime();
		return ID + MyTime + app.uniqId;
	};

	let cloneObject = function(Objet) {
		if (!Objet || typeof Objet !== 'object') {
			log('Objet à cloner invalide');
			return false;
		}
		return JSON.parse(JSON.stringify(Objet));
	};

	let USDate = function(date = null) {
		date = date || new Date();
		let month = ("0" + (date.getMonth() + 1)).slice(-2);
		let day = ("0" + date.getDate()).slice(-2);
		return date.getFullYear() + '-' + month + '-' + day;
	};

	let getHourString = function(date = null) {
		date = date || new Date();
		let hour = ("0" + date.getHours()).slice(-2);
		let minutes = ("0" + date.getMinutes()).slice(-2);
		return hour + 'h' + minutes;
	};

	let randomColor = function(median = 150, opacity = 1) {
		app.mainColor = app.mainColor++ > 3 ? 1 : app.mainColor;

		let R = app.mainColor === 1 ? randomInt(median - 20,  median + 80) : randomInt(median - 50,  median + 50);
		R = R < 0 ? 0 : (R > 255 ? 255 : R);

		let G = app.mainColor === 2 ? randomInt(median - 20,  median + 80) : randomInt(median - 50,  median + 50);
		G = G < 0 ? 0 : (G > 255 ? 255 : G);

		let B = app.mainColor === 3 ? randomInt(median - 20,  median + 80) : randomInt(median - 50,  median + 50);
		B = B < 0 ? 0 : (B > 255 ? 255 : B);

		if (opacity === 1) {
			app.lastColor = 'rgb(' + R + ', ' + G + ', ' + B + ')';
			return 'rgb(' + R + ', ' + G + ', ' + B + ')';
		}
		else {
			app.lastColor = 'rgba(' + R + ', ' + G + ', ' + B + ', ' + opacity + ')';
			return 'rgba(' + R + ', ' + G + ', ' + B + ', ' + opacity + ')';
		}
	};

	let randomInt = function(min, max) {
		min = Math.ceil(min);
		max = Math.floor(max);
		return Math.floor(Math.random() * (max - min +1)) + min;
	};

	let log = function (message) {
		if (app.logs) console.log(message);
	};

	return 	{
		getImages: getImages,
		getTemplates: getTemplates,
		getJSFiles: getJSFiles,
		shareJSFiles: shareJSFiles,
		loadTemplate: loadTemplate,
		checkFolder: checkFolder,
		checkFile: checkFile,
		loadInfo: loadInfo,
		getJSONData: getJSONData,
		htmlEntities: htmlEntities,
		beautifyString: beautifyString,
		USDate: USDate,
		getHourString: getHourString,
		randomColor: randomColor,
		randomInt: randomInt,
		uniqId: uniqId,
		cloneObject: cloneObject,
		log: log
	};

};
