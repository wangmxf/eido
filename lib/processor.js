var fork = function(o){return Object.create(o)}

function walk(r, s, fMatch, fGap){
	var l = r.lastIndex;
	fMatch = fMatch || function(){};
	fGap = fGap || function(){};
	var match, last = 0;
	while(match = r.exec(s)){
		if(last < match.index) fGap(s.slice(last, match.index));
		fMatch.apply(this, match);
		last = r.lastIndex;
	};
	if(last < s.length) fGap(s.slice(last));
	r.lastIndex = l;
	return s;
};
var ttype = function(name){name = name || ''; return {toString: function(){return name}}};
var LIT = ttype('Lit');
var MARCO = ttype('Marco');
var LB = ttype('LB');
var RB = ttype('RB');
var PBR = ttype('PBR');
var FIN = ttype('FIN');

var Nulllit = function(){return {type: FIN}};


function lexLine(s){
	var tokens = [];
	var n = 0;
	function push(t){ tokens[n++] = t };
	function concat(list){ tokens = tokens.concat(list); n += list.length}

	walk(/(\\ )|(\\(?:\w+|[\\'\[\]\(\)~!@#$%^&*,\.\/<>?;:"\{\}\|\-=_+]))|\{(=+)\{(.*?)\}\3\}|\{\{(.*?)\}\}|(\{\s*|\s*\})|(`+|\*+|~+)(.*?)\7/g, s,
		function(m, space, marco, _3, txt, txtb, bracket, _7, sourcely){
			if(space) push({type: LIT, text:'', raw: true})
			else if(marco) push({type: MARCO, text: marco.slice(1).trim()})
			else if(bracket) push({type: bracket.trim() === '{' ? LB : RB})
			else if(txt || txtb) {
				push({type: LB});
				push({type: LIT, text: txt || txtb, raw: true});
				push({type: RB});
			} else if(_7) {
				var sourcelyChar = _7.charAt(0);
				push({type: MARCO, text: 'inline_' + sourcelyChar});
				push({type: LB});
				if(sourcelyChar === '`'){
					push({type: LIT, text: sourcely})
				} else {
					concat(lexLine(sourcely));
				};
				push({type: RB});
				push({type: LB});
				push({type: LIT, text: _7.length, raw: true})
				push({type: RB});
				push({type: FIN})
			}
		}, function(s){if(s) push({type: LIT, text: s})});

	return tokens;
};
//	console.log(tokens);
function parseLine(s){
	var tokens = lexLine(s);
	var i = 0, token = tokens[0];
	var TNULL = { type: null }
	function move(){ 
		i++; 
		token = tokens[i] || TNULL;
	};
	function block(){
		move();
		var b = parse();
		if(token.type !== RB) throw 'Parse error!'
		move();
		return b;
	};
	function call(){
		var h = token.text;
		var args = [];
		var f;
		move();
//		if(token.type === MARCO){
//			args.push(call())
//		} else {
			while (token.type === LB){
				args.push(block())
			}
//		}
		return [h].concat(args);
	};
	function parse(){
		var buff = [];
		while(token.type && token.type !== RB && token.type !== PBR)
			if(token.type === LIT){
				buff.push([token.raw? '__raw' : '__lit', token.text]);
				move();
			} else if(token.type === MARCO) {
				buff.push(call())
			} else if(token.type === LB) {
				buff.push(block())
			} else if(token.type === FIN){
				move()
			};
		if(buff.length > 1){
			buff.unshift('__cons')
		} else {
			buff = buff[0]
		};
		return buff;
	};

	return parse();
};

var FP_NOTHING = function(){};
function parseSource(text){
	var ans = [];

	walk(/^::(.*)\n([\s\S]*)|^([:|])(.*)\n+((?:(?:\t|    ).*\n+)*)/gm, text,
		function(m, head, body, fMethod, fhead, fbody){

			head = (head || fhead || '').trim();
			if(!body){ 
				body = (fbody || '').replace(/^(?:\t|    )/gm, '')
			};
			if(fMethod === '|'){
				var headLits = parseLine('\\' + head);
				var bodyLits = ['__raw', body];
			} else {
				var headLits = parseLine('\\' + head);
				var bodyLits = parseSource(body);
			}

			if(bodyLits){
				ans.push(headLits.concat([bodyLits]))
			} else {
				ans.push(headLits)
			}
		},
		function(s){
			var splits = formParas(s);
			if(splits) ans = ans.concat(splits);
		});

	if(ans.length > 1)
		ans.unshift('__cons');
	else {
		ans = ans[0];
		if(ans && ans[0] === '_p')
			ans = ans[1];
	}
	
	return ans;
};

function formParas(p){
	if(!p) return null;

	var t = [];

	// form headings
	p = p.replace(/^(.*)\n-+$/gm, function(m, $1){
		t.push(['_h', parseLine($1)]);
		return '';
	});

	p = p.replace(/^((?: {0,2}-.*(?:\n+(?:\t| {2,}).*)*\n)+)|((?:[^:\n\t].*\n)+)/gm, function(m, list, para){
		if(list) {
			var a = list.split(/^ {0,2}-\s*/m);
			var m = ['_ul']
			for(var i = 0; i < a.length; i++){
				var term = a[i];
				if(term){
					m.push(['_li', parseLine(term)]);
				}
			};
		} else if(para){
			var m = ['_p', parseLine(para.trim())]
		}
		t.push(m);
		return '';
	});

	return t;
};

function fInvoke(tree){
	var f = this[tree[0]];
	if(typeof f === 'function'){
		var args = tree.slice(1);
		var nByref = f.nByref || 0;
		for(var i = 0; i < args.length - nByref; i++)
			args[i] = transform.call(this, args[i]);
		return f.apply(this, args)
	} else {
		return f || ''
	};
};
// Call by value
function transform(tree){
	if(!Array.isArray(tree)) return tree;
	if(tree[0] === '\''){
		return tree[1];
	};
	return fInvoke.call(this, tree);
};

exports.fork = fork;
exports.parse = parseSource;
exports.transform = transform;