dojo.provide( "dojox.jtlc.CHT" );

dojo.require( "dojox.jtlc.qplus" );
dojo.require( "dojo.parser" );

dojox.jtlc._beginsWith = function( a, b ) {
	return a.substr( 0, b.length ) == b;
}

dojox.jtlc._hasPrefix = function( s, pfxs, map ) {
	for( var i=0; i<pfxs.length; ++i )
		if( dojox.jtlc._beginsWith( s, map ? map( pfxs[i] ) : pfxs[i] ) )	return pfxs[i];
	return null;
}

dojox.jtlc._tokenizeCHT = function( input )
{
	var	dj = dojox.jtlc,

		brackets = [
			{ prefix: '<!--', suffix: '-->', allow: [ '-->' ], extra: '\ufffc' },
			{ prefix: '<?', suffix: '?>', allow: [ '"', "'", '?>', '<!--' ], markup: true, extra: '\uffff' },
			{ prefix: '<', suffix: '>', allow: [ '"', "'", '{{', '>', '<!--' ], extra: '\ufffe' },
			{ prefix: '{{', suffix: '}}', allow: [ '"', "'", '(', '[', '{', '}}' ], substitution: true, extra: '\ufffd' },
			{ prefix: '{', suffix: '}', allow: [ '"', "'", '(', '[', '{', '}' ] },
			{ prefix: '(', suffix: ')', allow: [ '"', "'", '(', '[', '{', ')' ] },
			{ prefix: '[', suffix: ']', allow: [ '"', "'", '(', '[', '{', ']' ] },
			{ prefix: '"', suffix: '"', allow: [ '"', '\\' ], inSubstitution: true },
			{ prefix: '"', suffix: '"', allow: [ '"', '\\', '{{' ], inSubstitution: false },
			{ prefix: "'", suffix: "'", allow: [ "'", '\\' ], inSubstitution: true },
			{ prefix: "'", suffix: "'", allow: [ "'", '\\', '{{' ], inSubstitution: false },
			{ prefix: '\\', escape: true }
		],

		script_bracket = { suffix: '</script', allow: [ '"', "'", '{{', '</script' ] },

		stack = [ 
			{ allow: [ '<!--', '<?', '<', '{{' ] }
		],

		last_pos = 0,
		html_tag = '',
		in_substitution = false,

		parsed = input.replace( 
			/(?:<(?:[?]\s*)?[/]?[a-z_]\w*|<!--|-->|[?]?>|[{][{]?|[}][}]?|["'\[\]()\\])/ig,
			function( s, pos, src ) {

				if( stack[0].escape ) {
					stack.shift();
					if( pos == lp+1 )	return s;
				}

				var pfx = dj._hasPrefix( s.toLowerCase(), stack[0].allow ),
					lp = last_pos;

				last_pos = pos + s.length;

				if( pfx ) {

					if( pfx == stack[0].suffix ) {

						var	top = stack.shift();

						if( top.substitution )	in_substitution = false;

						if( top !== script_bracket ) {
							if( !top.markup && s.charAt(s.length-1) == '>' && html_tag == 'script' ) {
								stack.unshift( script_bracket );
								return s;
							}

							return (top.substitution ? '':s) + (top.extra || '');
						}
					}

					if( pfx = dj._hasPrefix( pfx, brackets, 
							function(b){ 
								if( 'inSubstitution' in b && b.inSubstitution != in_substitution )
										return '\xffff';
								else return b.prefix; 
							} 
					) ) {
						if( pfx.escape )	return s;

						if( s.charAt(0) == '<' )
							html_tag = /^<(\/?[a-z_]*)/i.exec( s )[1].toLowerCase();

						stack.unshift( pfx );
						if( pfx.substitution )	in_substitution = true;

						return (html_tag != '/script' && pfx.extra||'') + (pfx.substitution ? '':s);
					}	
				}

				return s;
			}
		).split( /(?:\ufffc[\s\S]*?\ufffc|\ufffe|\s*\uffff\s*)/ );

	if( stack.length > 1 )
		throw Error( "Unbalanced delimiters -- expected " + dj.stringLiteral( stack[0].suffix ) );

	return parsed;
}

dojox.jtlc._CHTElement = function( text ) {

	this.text = text;

	if( /^<[?]\s*[/]([a-z_]\w*(?:\s*[.]\s*[a-z_]\w*)*)[\s\S]*?[?]>$/i.exec( text ) ) {
		this.closeTag = RegExp.$1.split( /\s*[.]\s*/ ).join( '.' );
	} else	if( /^<[?]\s*([a-z_]\w*(?:\s*[.]\s*[a-z_]\w*)*)([\s\S]*?)\s*[?]>$/i.exec( text ) ) {

		this.openTag = RegExp.$1.split( /\s*[.]\s*/ ).join( '.' );
		this.kwarg = {}

		var	body = RegExp.$2;

		if( /^\s+(?![a-z]\w*=)(["']?)((?:\\.|[^\\])*?)\1(?=\s|$)/i.exec( body ) ) {
			this.arg = RegExp.$2;
			body = body.substr( RegExp.lastMatch.length );
		}

		while( body.length && /^\s+([a-z_]\w*)=/i.exec( body ) ) {
			body = body.substr( RegExp.lastMatch.length );
			var name = RegExp.$1;
			if( !/^(["']?)((?:\\.|[^\\])*?)\1(?=\s|$)/.exec( body ) )
				break;
			body = body.substr( RegExp.lastMatch.length );
			this.kwarg[name] = RegExp.$2;
		}

		if( body.length )
			throw Error( "Invalid CHT tag: " + text );

	} else throw Error( "Invalid CHT tag: " + text );
}

dojox.jtlc._CHTTemplateInstance = dojo.extend( 
	function( split_text, refs ) {
		this._split_text = split_text;
		this._refs = refs;
	}, {
		toString: function() {
			return this._split_text.join('');
		},

		toDom: function() {
			return dojo._toDom( this.toString() );
		},

		toParsedDom: function( options ) {

			var	master = dojo.create('div');

			dojo.place( this.toDom(), master, 'only' );

			var	old_refs = dojo.global._refs;
			dojo.global._refs = this._refs;

			var l = dojo.parser.parse( master, options );

			if( old_refs )	dojo.global._refs = old_refs;
			else			dojo.global._refs = {}; // IE throws a hissy fit on delete 

			if( options && options.instances )	
				Array.prototype.push.apply( options.instances, l );

			if( master.childNodes.length == 1 )
				return master.removeChild( master.firstChild );

			var dom = dojo.doc.createDocumentFragment();
			while( master.firstChild )	
				dom.appendChild( master.removeChild( master.firstChild ) );

			return dom;
		}
	}
);

(function() {

var	dj = dojox.jtlc;

dojo.declare( 'dojox.jtlc._NullSink', dj._Sink, {
	append: function() { this.closeLoops(); }
} );

dojo.declare( 'dojox.jtlc.CHT', dj.Language, {

	constructor: function( settings ) {
		this.qplus = new dj.qplus( dojo.mixin( {}, { tags: this.tags }, settings ) );
		dojo.mixin( this, settings );
	},

	parse: function( input, ns ) {
		var _this = this;
		return dojo.when( 
			this._buildTemplates( dj._tokenizeCHT( input ) ),
			function(v){ 
				return _this._buildAST( v, ns || {} ); 
			}
		);
	},

	/*
		Stage I: split tokenized input into individual template definitions.

		When this function executes, not all external references may be satisfied.
		It is impossible to fully parse the CHT as we don't yet know which elements
		may require a closing tag!
	*/
	_buildTemplates: function( tokens ) {

		var	_this = this,
			current = null,
			body = null,
			parsed = {},
			refs = {},
			tos = { 'template':1, 'section':1 };

		dojo.forEach( tokens, function( t ) {
			if( t.substr( 0, 2 ) == '<?' ) {
				var	elt = new dj._CHTElement( t );
				if( !current && elt.openTag != 'template' )
					throw Error( 'CHT element encountered outside template: ' + t );
				if( current && elt.openTag == 'template' )
					throw Error( 'Missing end of previous template at: ' + t );

				if( elt.closeTag == 'template' )
					current = body = null;
				else if( elt.openTag in tos ) {
					if( elt.arg in tos || elt.arg in _this.elements ||
						!/^[a-z]\w*$/i.test( elt.arg||'' ) && (elt.openTag != 'section' || elt.arg) )
						throw Error( 'Bad or missing name for CHT ' + elt.openTag + ': ' + t );
					if( elt.openTag == 'template' ) {
						parsed[elt.arg] = current = elt;
					} else {
						elt.arg = elt.arg || '';
						current.body.push( elt );
						(current.sections = current.sections || {})[elt.arg] = {};
					}
					body = elt.body = [];
				} else if( elt.closeTag == 'section' ) {
					if( body === current.body )
						throw Error( 'Mismatched ' + t );
					body = current.body;
				} else {
					if( elt.openTag && elt.openTag.indexOf('.')>=0 )
						refs[elt.openTag] = false;
					body.push( elt );
				}
			} else if( t ) {

				var substitutions = [],
				 	t = t.replace( /\ufffd([\s\S]*?)\ufffd/g, 
						function( _, subst ) {
							var	s = _this.qplus.parse( subst );
							substitutions.push( 
								t.charAt(0)=='<' ? 
									/^<script/i.test( t ) ? s : 
									_this.tags.escapeAttribute( s ) : 
								_this.tags.escapeText( s ) 
							);
							return '{' + (substitutions.length-1).toString() + '}';
						}
					);

				if( !t ) return;
				if( !current )
					throw Error( 'HTML content encountered outside template: ' + t );
					
				if( t == '{0}' )	
					body.push( substitutions[0] );
				else if( t.charAt(0) != '<' && /\b(?:[a-zA-Z][a-z]*|[A-Z]+)\b/.test( t.replace( /&[a-z]{3,4};/,'' ) ) )
					body.push( _this.tags.i18n( t, substitutions ) );
				else if( substitutions.length )
					body.push( _this.tags.replaceN( t, substitutions ) );
				else if( body[body.length-1] instanceof dj.tags._quote )
					body[body.length-1].value += t;
				else
					body.push( dj.tags.quote( t ) );
			}
		} );

		if( this.loadTemplates )
			return dojo.when(
				this.loadTemplates( refs ),
				function( r ) { return { refs: r, parsed: parsed };	}
			);
		else
			return { refs: refs, parsed: parsed };
	},

	/*
		Stage II: convert each template definition into a jtlc-compatible AST.

		When this function executes, all external references should have been
		satisfied -- and the unsatisfied ones are considered errors.
	*/
	_buildAST: function( rp, ns ) {

		for( var elt_name in rp.parsed )
			ns[elt_name] = new this._userDefinedElement( rp.parsed[elt_name] );

		var	refs = dojo.mixin( rp.refs, ns, this.elements ),
			_this = this;

		function parseDefinition( body ) {
			var	stack = [],
				lit_seq_start = -1;

			for( var i=0; i<body.length; ++i ) {

				if( body[i] instanceof dj._CHTElement ) {
					if( lit_seq_start >= 0 ) {
						body.splice( lit_seq_start, 0,
							new _this._appendToOutput( body.splice( lit_seq_start, i - lit_seq_start ) )
						);
						i = lit_seq_start+1;
						lit_seq_start = -1;
					}

					var	tag = body[i].openTag || body[i].closeTag,
						parent,
						section = ( stack.length && (parent = body[stack[0]]).def_sections ||
								    stack.length > 1 && (parent = body[stack[1]]).def_sections )
								  &&  parent.def_sections[tag];

					if( tag == 'section' ) {
						body[i] = new _this._userDefinedSection( body[i].arg, parseDefinition( body[i].body ), elt_name );
						continue;
					}

					if( section && body[i].closeTag )
						throw Error( 'Closing tags not allowed for sections: ' + body[i].text );

					if( !section && !(tag in refs) && tag != 'section' )
						throw Error( 'Unknown CHT element: ' + body[i].text );

					if( body[i].openTag ) {
						if( section ) {
							if( body[i].arg && !section.allowArgument )
								throw Error( 'Argument not allowed here: ' + body[i].text );
							if( !section.allowMultiple && dojo.some( parent.sections, function(s){ return s.openTag == body[i].openTag; } ) )
								throw Error( 'Section appears more than once: ' + body[i].text );
							body[stack[0]].body = body.splice( stack[0]+1, i - stack[0] - 1 );
								i = stack[0] + 1;

							if( body[stack[0]] !== parent )	{
								body.splice( stack[0], 1 );
								stack.shift();
								--i;
							}

							parent.sections.push( body[i] );
							stack.unshift( i );
						} else if( refs[tag].sections ) {
							stack.unshift( i );
							body[i].def_sections = refs[tag].sections;
							body[i].sections = [];
						} else { // non-sectioned element (widget)
							body[i] = refs[tag].tag( _this, body[i] );
						}
					} else { // body[i].closeTag
						if( !parent || parent.openTag != body[i].closeTag )
							throw Error( 'Unbalanced closing tag: ' + body[i].text );

						body[stack[0]].body = body.splice( stack[0]+1, i - stack[0] - 1 );
						i = stack[0] + 1;

						if( body[stack[0]] !== parent )	{
							body.splice( stack[0], 1 );
							stack.shift();
							--i;
						}

						if( parent.body.length && !("" in parent.def_sections) ) {
							var t = '';
							for( var s in parent.def_sections ) {
								if( t )	t += ', ';
								t += '<?' + s + '?>';
							}
							throw Error( '<?' + parent.openTag + '?> must be followed by ' + t );
						}

						if( !parent.body.length )	delete parent.body;

						body[stack[0]] = refs[tag].tag( _this, parent );
						body.splice( i--, 1 );
						stack.shift();
					}
				} else { // Literal
					if( lit_seq_start < 0 )	lit_seq_start = i;
				}
			}

			if( stack.length )
				throw Error( 'No closing tag for: ' + body[stack[ body[stack[0]].def_sections ? 0:1 ]].text );

			if( lit_seq_start >= 0 )
				body.push( new _this._appendToOutput( body.splice( lit_seq_start, body.length-lit_seq_start ) ) );

			return body;
		}

		for( var elt_name in rp.parsed )
			ns[elt_name].body = parseDefinition( rp.parsed[elt_name].body );

		return ns;				
	},

	compileBody: function( tpl ) {
		this._chtRefs = this.addLocal();
		this._chtSections = {};
		this.code.push( this._chtRefs + '=[];' );
		this.accumulated( 
			'=[];', new dj._ArraySink( this ), null, 
			function() {
				this._chtHTML = this.sink.accumulator;
				this.compile( tpl ); 
			}
		);
		this.expressions.push( 'new ' + this.addGlobal( dojox.jtlc._CHTTemplateInstance ) + '('
			+ this.popExpression() + ',' + this._chtRefs + ')' );
	},

	compileSequence: function( body ) {
		this.accumulated( null, new dj._NullSink( this ), this.loop, 
			function() {
				dojo.forEach( body, function(v) {
					this.compile( v );
					this.sink.append();
				}, this );
			}
		);
	},

//	string: dj.qplus.prototype.string,

	replaceLanguage:	dojo.replace,
//	queryLanguage:		dojox.json.query,

	_appendToOutput: dojo.extend(
		function( body ) {
			this.body = body;
		},{
			compile: function( self ) {
				dojo.forEach( self.body, function(v) {
					this.compile( v );
					this.code.push( this._chtHTML + '.push(' + this.popExpression() + ');' );
				}, this );
			}
		}
	),

	_userDefinedElement: dojo.extend( 
		function( elt ) {
			if( elt.kwarg && elt.kwarg.compiled ) {
				if( elt.sections )	throw Error( "Compiled template " + elt.arg + " should not have sections" );
				this.alwaysCompile = true;
			}

			if( elt.sections )	this.sections = elt.sections;
			this.name = elt.arg;
		},{
			_tag: dojo.extend(
				function( cht, elt, def ) {
					this.def = def;
					if( elt.arg )	this.arg = cht.qplus.parse( elt.arg );
					if( elt.sections ) {
						this.sections = {};
						dojo.forEach( elt.sections, function(s) {
							this.sections[s.openTag] = s.body;
						}, this );
						if( elt.body )	this.sections[""] = elt.body;
					}
				}, {
					compile: function( self ) {
						var old_current_input;
						
						if( self.arg ) {
							old_current_input = this.hasOwnProperty( 'current_input' ) ? this.current_input : null;
							this.compile( self.arg );
							this.current_input = this.popExpression();
						}

						if( self.sections )	
							this._chtSections[ self.def.name ] = self.sections;

						this.compileSequence( self.def.body );
						
						if( self.sections )
							delete this._chtSections[ self.def.name ];

						if( self.arg ) {					
							if( old_current_input )	this.current_input = old_current_input;
							else 					delete this.current_input; 			
						}
					}
				}
			),

			_compiledTag: dojo.extend(
				function( cht, elt, tag ) {
					this.name = elt.openTag;
					this.tag = tag;
					if( elt.arg )	this.arg = elt.arg;
					this.bind = cht.tags.bind;					
				}, {
					compile: function( self ) {

						if( !('compiledTemplates' in this) )	this.compiledTemplates = {};
						if( !(self.name in this.compiledTemplates) ) {
							// Create a forwarding thunk to resolve issues with template recursion
							var forward_to = null;
							this.compiledTemplates[self.name] = function(){ return forward_to.apply( this, arguments ); }

							this.compiledTemplates[self.name] = forward_to =
								dj.compile( self.tag, this.compileArguments.language, 
											dojo.mixin( { compiledTemplates: this.compiledTemplates }, this.compileArguments.options )
								);
						}

						var fn = this.addGlobal( this.compiledTemplates[self.name] );

						if( self.arg )	this.compile( self.arg );
						else			this.generator();

						var v = this.popExpression(),
							t = this.addLocal();

						if( v == '$[0]' ) {
							this.code.push( t + '=' + fn + '.apply(null,$);' );
						} else {
							var t = this.addLocal();
							this.code.push( t + '=' + this.addGlobal( dj._copyArguments ) + '($);' );
							this.code.push( t + '[0]=' + v + ';' );
							this.code.push( t + '=' + fn + '.apply(null,' + t + ');' );
						}
						this.code.push( 'if(' + t + '._refs.length)' + this._chtRefs + '=' + this._chtRefs + '.concat(' + t + '._refs);' );

						this.expressions.push( t + '.toString()' );
					}
				}
			),

			tag: function( cht, elt ) {
				if( this.alwaysCompile && elt.openTag )
						return new cht._appendToOutput( [ new this._compiledTag( cht, elt, new this._tag( cht, {}, this ) ) ] );
				else	return new this._tag( cht, elt, this ); 
			},

			compile: function( self ) {
				this.compile( self.tag( this, {} ) );
			}
		}	 
	),

	_userDefinedSection: dojo.extend(
		function( name, body, tpl_name ) {
			this.body = body;
			this.name = name;
			this.tplName = tpl_name;
		}, {
			compile: function( self ) {
				this.compileSequence( (this._chtSections[self.tplName]||{})[self.name] || self.body );
			}
		}
	),

	elements: {

		"if": {
			sections: {	"" : {allowArgument:true}, "elseif" : {allowArgument:true,allowMultiple:true}, "else": {} },

			_tag: dojo.extend( 
				function( cht, elt ) {
					this.ifTrue = [ {
						condition: elt.arg ? cht.qplus.parse( elt.arg ) : dj.tags.current(),
						body: elt.body
					} ];

					dojo.forEach( elt.sections, function(s) {
						if( s.openTag == 'elseif' )
							this.ifTrue.push( {
								condition: s.arg ? cht.qplus.parse( s.arg ) : dj.tags.current(),
								body: s.body
							} );
						else
							this.ifFalse = s.body;
					}, this );
				},{
					compile: function( self ) {
					
						dojo.forEach( self.ifTrue, function( s, i ) {
							this.compile( s.condition );
							this.code.push( ( i == 0 ? 'if(' : '}else if(' ) + this.popExpression() + '){' );
							this.compileSequence( s.body );
						}, this );

						if( self.ifFalse ) {
							this.code.push( '}else{' );
							this.compileSequence( self.ifFalse );
						}

						this.code.push( '}' );
					}
				} 
			),

			tag: function( cht, elt ) {	return new this._tag( cht, elt ); }
		},

		"foreach": {
			sections: { "" : {allowArgument:true}	},
			tag: function( cht, elt ) {
				return dj.tags.one( dj.tags.many(	// Ensure fresh loop context
					cht.tags.foreachBody( elt.body, elt.arg && cht.qplus.parse( elt.arg ) )
				) );
			}
		},

		"group": {
			sections: { "" : {allowArgument:true}	},

			tag: function( cht, elt ) {
				if( !!elt.kwarg.key == !!elt.kwarg.count )
					throw Error( 'Group element should have one of attributes: key=, count=' );
				return dj.tags.one( dj.tags.many(	// Ensure fresh loop context
					dj.tags.group( 
						elt.kwarg.key ?
							cht.qplus.parse( elt.kwarg.key, true ) :
							dj.tags.expr( 'Math.floor($#/(' + elt.kwarg.count + '))' ),
						cht.tags.genericBody( elt.body ),
						elt.arg ? cht.qplus.parse( elt.arg ) : dj.tags.current()
					)
				) );
			}
		}
	},

	string: dojox.jtlc.qplus.prototype.string,
	queryLanguage: dojox.json.query,

	_declareTag: dj._declareTag,

	tags: new (dojo.extend( function(){}, dj.qplus.prototype.tags ))()
});

})();

(function( djcp ) {

	var dj = dojox.jtlc;

	djcp._declareTag( 'foreachBody', {

		constructor: function( body, input ) {
			this.body = body;
			if( input )	this.input = input;
		},

		compile: function( self ) {
		
			if( self.input )
				this.compile( self.input );
			else
				this.generator();

			this.loop.lockItem( this.popExpression() );
			this.compileSequence( self.body );
		}
	} );

	djcp._declareTag( 'genericBody', {
		constructor: function( body ) {
			this.body = body;
		},

		compile: function( self ) {
			this.compileSequence( self.body );
			this.generator();
		}
	} );

	djcp._declareTag( 'replaceN', dojo.declare( dj._MultiArgTag, {
		constructor: function( fmt, args ) {
			this.format = fmt;
			this.args = args || [];
		},

		formatString: function( self ) {
			return dj.stringLiteral( self.format );
		},

		compile: function( self ) {
			if( !( '_pushLiteralOptimizer' in this.optimizers ) )
				this.optimizers._pushLiteralOptimizer = self.optimize;

			if( self.args.length ) {
				this._replaceFunction = this._replaceFunction || this.addGlobal( dojo.replace );
				self.compileArgs.call( this, self, true );
				this.expressions.push( this._replaceFunction + '(' + self.formatString.call( this, self ) + ',[' + self.argumentList.call( this, self ) + '])' );
			} else {
				this.expressions.push( self.formatString.call( this, self ) );
			}
		},

		optimize: function( body ) {
			return body.replace(
				/(?:b\.push\("(?:\\.|[^\\"])*"\);){2,}/g,
				function( seq ) {
					return 'b.push("' + seq.replace( /b\.push\("((?:\\.|[^\\"])*)"\);/g, '$1' ) + '");';
				}
			);
		}

	} ) );

	djcp._declareTag( 'i18n', dojo.declare( djcp.tags._replaceN, {
		constructor: function() {
			if( !(this.args instanceof Array) )
				this.args = [ this.args ];
		},

		formatString: function( self ) {
			if( this.i18nDictionary && !(self.format in this.i18nDictionary) )
				this.i18nDictionary[self.format] = false;
			return dj.stringLiteral( this.i18nDictionary && this.i18nDictionary[self.format] || self.format );
		}
	} ) );

	var escapeTag = dojo.declare( null, {
		constructor: function( arg ) {
			this.arg = arg;
		},
		compile: function( self ) {

			this['_escape' + self.cachePrefix + 'Regex'] = this['_escape' + self.cachePrefix + 'Regex'] || this.addGlobal( self.escapeRegex );
			this['_escape' + self.cachePrefix + 'Fn'] = this['_escape' + self.cachePrefix + 'Fn'] || this.addGlobal( self.escapeFn );

			var replace_params = this['_escape' + self.cachePrefix + 'Regex'] + ',' + this['_escape' + self.cachePrefix + 'Fn'];

			if( !( '_escape' + self.cachePrefix + 'Optimizer' in this.optimizers ) ) {
				var regex = new RegExp( '\\(("(?:\\\\.|[^\\\\"])*")\\)\\.toString\\(\\)\\.replace\\(' + replace_params + '\\)', 'g' );
				this.optimizers['_escape' + self.cachePrefix + 'Optimizer'] = function( body ) {
					return body.replace( regex, '$1' );
				}
			}

			this.compile( self.arg );
			var	what = this.popExpression();
			if( !/^\(.*\)$/.test( what ) )
				what = '(' + what + ')';
			this.expressions.push( what + '.toString().replace(' + replace_params +	')' );
		}
	} );

	function makeEscapeTag( cls ) { 
		return function(arg) { 
			return arg instanceof djcp.tags._raw ? arg.arg : 
				   new cls( arg );
		}
	}

	djcp._declareTag( 'escapeAttribute', dojo.declare( escapeTag, {
		
		cachePrefix: 'Attr',

		escapeRegex: /[<>'"&]/g,

		escapeFn: function(x) { 
			return { "<": '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;', '&': '&amp;' }[x];
		}
	} ), makeEscapeTag );

	djcp._declareTag( 'escapeText', dojo.declare( escapeTag, {
		
		cachePrefix: 'Text',

		escapeRegex: /[<>&]/g,

		escapeFn: function(x) { 
			return { "<": '&lt;', '>': '&gt;', '&': '&amp;' }[x];
		}
	} ), makeEscapeTag );

	djcp._declareTag( 'raw', {
		constructor: function( arg ) {
			this.arg = arg;
		},
		compile: function( self ) {
			this.compile( self.arg );
		}
	} );

	djcp._declareTag( 'ref', {
		constructor: function( arg ) {
			this.arg = arg;
		},
		compile: function( self ) {
			this.compile( self.arg );
			this.code.push( this._chtRefs + '.push(' + this.popExpression() + ');' );
			this.expressions.push( '"dojo.getObject(\\"_refs." + (' + this._chtRefs + '.length-1) + "\\")"' );
		}
	} );

})( dojox.jtlc.CHT.prototype );

