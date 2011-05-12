// Copyright (C) 2010-2011 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "dojox.jtlc.CHT" );

dojo.require( "dojox.jtlc.CHT.scanner" );
dojo.require( "dojox.jtlc.CHT.instance" );
dojo.require( "dojox.jtlc.qplus" );

(function() {

var	dj = dojox.jtlc;

dojo.declare( 'dojox.jtlc._NullSink', dj._Sink, {
	append: function() { this.closeLoops(); }
} );

dj._copyArgumentsReplaceFirst = function( args, first ) {
	args = dj._copyArguments( args );
	args[0] = first;
	return args;
};

var replaceRegex = /[{](\d+)[}]/g;

dj._replaceN = function( fmt ) {
	return dojo.replace( fmt, dj._copyArguments( arguments, 1 ), replaceRegex );
};

dj._chtGlobalContext = { refID: 0, markerID: 0 };

dojo.declare( 'dojox.jtlc.CHT', dj.Language, {

	domMarkerPrefix: '_CHT_DOM_Marker_',

	constructor: function( settings ) {
		this.qplus = new dj.qplus( dojo.mixin( {}, { tags: this.tags }, settings ) );
		dojo.mixin( this, settings );
	},

	parse: function( input, ns, url ) {
		var _this = this;
		
		if( typeof ns === 'string' ) {
			url = ns;
			ns = {};
		}

		return dojo.when( 
			this._buildTemplates( dj._tokenizeCHT( input ) ),
			function(v){ 
				return _this._buildAST( v, ns || {}, url || '[CHT-Templates]' ); 
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

		function markDom( elt ) {
			if( elt.markerElement )	body.push( _this.tags.markDom( elt.markerElement ) );
		}

		dojo.forEach( tokens, function( t ) {
			if( t.substr( 0, 2 ) == '<?' ) {
				var	elt = new dj._CHTElement( t );
				if( !current && elt.openTag != 'template' )
					throw Error( 'CHT element encountered outside template: ' + t );
				if( current && elt.openTag == 'template' )
					throw Error( 'Missing end of previous template at: ' + t );

				if( elt.closeTag == 'template' ) {
					markDom( current );
					current = body = null;
				} else if( elt.openTag in tos ) {
					if( elt.arg in tos || elt.arg in _this.elements ||
						!/^[a-z]\w*$/i.test( elt.arg||'' ) && (elt.openTag != 'section' || elt.arg) )
						throw Error( 'Bad or missing name for CHT ' + elt.openTag + ': ' + t );
					if( elt.openTag == 'template' ) {
						parsed[elt.arg] = current = elt;
						if( elt.kwarg.marker )	{
							elt.markerElement = elt.kwarg.marker;
							elt.kwarg.async = true;
						}

						if( elt.kwarg.async )	elt.kwarg.compiled = true;

						if( elt.kwarg.macro && elt.kwarg.compiled )
							throw Error( 'Compiled template cannot use macro argument substitution: ' + elt.arg );
					} else {
						elt.arg = elt.arg || '';
						current.body.push( elt );
						(current.sections = current.sections || {})[elt.arg] = {};
					}
					body = elt.body = [];
					markDom( elt );
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
							return s instanceof _this.tags._do ? '' : '{' + (substitutions.length-1).toString() + '}';
						}
					);

				if( !current )
					throw Error( 'HTML content encountered outside template: ' + t );
					
				if( t == '{0}' )	
					body.push( substitutions[0] );
				else if( t.charAt(0) != '<' && /\b(?:[a-zA-Z][a-z]*|[A-Z]+)\b/.test( t.replace( /&[a-z]{3,4};/,'' ) ) )
					body.push( _this.tags.i18n( t, substitutions ) );
				else if( substitutions.length )
					body.push( _this.tags.replaceN( t, substitutions ) );
				else if( body.length && body[body.length-1] instanceof dj.tags._quote )
					body[body.length-1].value += t;
				else
					body.push( dj.tags.quote( t ) );
			}
		}, this );

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
	_buildAST: function( rp, ns, url ) {

		for( var elt_name in rp.parsed )
			if( !ns.hasOwnProperty(elt_name) )
				ns[elt_name] = new this._userDefinedElement( rp.parsed[elt_name], url + '/<?' + elt_name + '?>' );

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
			if( !ns[elt_name].body )
				ns[elt_name].body = parseDefinition( rp.parsed[elt_name].body );

		return ns;				
	},

	compileBody: function( tpl ) {

		this.sourceUrl = tpl.sourceUrl || tpl.def.sourceUrl;

		this._chtSections = {};
		this._deferredIndex = 0;

		var def_code_idx = this.code.length;
		this._chtDeferred = this.addLocal();
		this.code.push( this._chtDeferred + '=new ' + this.addGlobal( dj._CHTDeferredAccessor ) + '(this);' );

		var refID = this.addLocal(),
			gctx = this.addGlobal( dj._chtGlobalContext );

		this.code.push( refID + '=' + gctx + '.refID++;' );

		var	ref_code_idx = this.code.length,
			refs = this.addLocal();

		this._chtRefs = { refs: refs, index: refID };
		this.code.push( refs + '=[];' );

		this.accumulated( 
			'=[];', new dj._ArraySink( this ), null, 
			function() {
				this._chtHTML = this.sink.accumulator;
				this.compile( tpl ); 
			}
		);

		var cons = this.addGlobal( this._deferredIndex ?
			dojox.jtlc._CHTIncrementalTemplateInstance :
			dojox.jtlc._CHTTemplateInstance 
		),
			result = this.popExpression();

		if( !this._hasRefs ) {
			this.code.splice( ref_code_idx, 1 );
			this.optimizers._refLocalOptimize = function( body ) {
				return dojox.jtlc.replaceWithinJavascript( body, this._chtRefs.refs + ',', '' );
			}
		}

		this.code.push( 'if(!' + refID + ')' + gctx + '.refID=0;' );

		var transition = this._transition && (
			this.compile( this.tags.expr( '(' + this._transition + ')' ) ),
			this.popExpression()
		);

		function baseProps( has_refs ) {
			return '_split_text:' + result + 
				   (has_refs ? ',_refs:' + refs + ',_refID:' + refID : '') +
				   (transition ? ',_transition:' + transition : '');
		}

		this.expressions.push( this._deferredIndex ?
			'this instanceof ' + cons + '?' + this.addGlobal( dojo.mixin ) + '(this,{' +
				baseProps( this._hasRefs ) +
				( this._chtMarkerQuery ? ',_marker_query:' + this._chtMarkerQuery : '' ) +
			'}):new ' + cons + '({' + baseProps( this._hasRefs ) +
				( this._chtMarkerQuery ? ',_marker_query:' + this._chtMarkerQuery : '' ) +
				',_self:$self,_args:$,_cht_deferred:' + this._chtDeferred + '.storage,_max_deferred:' + this._deferredIndex +
			'})' :
			'new ' + cons + '({' + baseProps( this._hasRefs ) + '})'
		);

		if( this._deferredIndex == 0 )	{
			this.code.splice( def_code_idx, 1 );
			this.optimizers._defLocalOptimize = function( body ) {
				return dojox.jtlc.replaceWithinJavascript( body, this._chtDeferred + ',', '' );
			}
		}
	},

	decorate: function( f ) { 
		f.async = this._deferredIndex > 0;
		f.name  = this._templateName;
		return f; 
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
		this.expressions.pop();
	},

	replaceLanguage:	dojo.replace,

	_appendToOutput: dojo.extend(
		function( body ) {
			this.body = body;
			dojo.forEach( this.body, function(v) {
				if( v.simplify )	v.simplify();
			} );
		},{
			compile: function( self ) {
				dojo.forEach( self.body, function(v) {
					this.compile( v );
					if( v instanceof this.tags._do )
							this.code.push( this.popExpression() + ';' );
					else	this.code.push( this._chtHTML + '.push(' + this.popExpression() + ');' );
				}, this );
			}
		}
	),

	_userDefinedElement: dojo.extend( 
		function( elt, url ) {

			this.kwarg = elt.kwarg || {};

			if( this.kwarg.compiled && elt.sections )	
				throw Error( "Compiled template " + elt.arg + " should not have sections" );

			if( elt.sections )	this.sections = elt.sections;

			this.name = elt.arg;
			this.sourceUrl = url;
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

					_notAnExpression: { 
						toString: function(){ 
							throw Error( "BUG: access to current_input bypasses generator()" ); 
						} 
					},

					_argByName: function( compiler, generator, cur_input, expr ) {

						if( compiler.current_input === this._notAnExpression && !expr && !compiler.loop.lockedItem ) {
							if( cur_input )	compiler.current_input = cur_input;
							else 			delete compiler.current_input;
							compiler.compile( this.arg );
							compiler.current_input = this._notAnExpression;
						} else
							generator.call( compiler, expr );
					},

					compile: function( self ) {
						var old_current_input, old_generator;
						
						if( self.def.kwarg.macro && self.arg ) {
							old_current_input = this.hasOwnProperty( 'current_input' ) ? this.current_input : null;
							var	gen = this.generator;
							old_generator = this.hasOwnProperty( 'generator' ) ? gen : null;
							this.generator = function( expr ) { 
								self._argByName( this, gen, old_current_input, expr );
							}
							this.current_input = self._notAnExpression;
						}

						if( self.sections )	
							this._chtSections[ self.def.name ] = self.sections;
						
						if( !self.def.kwarg.macro && ( self.arg || this.current_input === self._notAnExpression ) ) {
							var	new_input, local;
							if( self.arg ) {
								this.compile( self.arg );
								new_input = this.popExpression();
								if( new_input.length > 4 ) {
									local = this.addLocal();
									this.code.push( local + '=' + new_input + ';' );
									new_input = '(' + local + ')';
								}
							} else
								new_input = this.generator();

							this.nonAccumulated( function() {
								this.compileSequence( self.def.body );
							}, new_input );

							if( local )	this.locals.pop();

						} else	this.compileSequence( self.def.body );

						if( self.sections )
							delete this._chtSections[ self.def.name ];

						if( self.def.kwarg.macro && self.arg ) {		
							if( old_generator )	this.generator = old_generator;
							else 				delete this.generator;
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
							this.compiledTemplates[self.name].async = self.tag.def.kwarg.async || false;

							this.compiledTemplates[self.name] = forward_to =
								dj.compile( self.tag, this.compileArguments.language, 
											dojo.mixin( 
												{ compiledTemplates: this.compiledTemplates }, 
												this.compileArguments.options,
												{ _templateName: self.name, _transition: self.tag.def.kwarg.transition }
											)
								);
						}

						var fn = this.addGlobal( this.compiledTemplates[self.name] ),
							is_deferred = this.compiledTemplates[self.name].async;

						var	v, w;

						if( is_deferred )	w = this._beginWait();

						if( self.arg )	this.compile( self.arg );
						else			this.generator();

						v = this.popExpression();
		
						if( v == '$[0]' ) {
							this.expressions.push( fn + '.apply(null,$)' );
						} else {
							this.expressions.push( fn + '.apply(null,' + this.addGlobal( dj._copyArgumentsReplaceFirst ) + '($,' + v + '))' );
						}

						if( is_deferred )	this._endWait( w, true );
					}
				}
			),

			tag: function( cht, elt ) {
				if( this.kwarg.compiled && elt.openTag )
						return new cht._appendToOutput( [ new this._compiledTag( cht, elt, new this._tag( cht, {}, this ) ) ] );
				else	return new this._tag( cht, elt, this ); 
			},

			compile: function( self ) {
				this._templateName = self.name;
				if( self.kwarg.transition )	this._transition = self.kwarg.transition;
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

	_beginWait: function() {
		this.code.push( 'if(!' + this._chtDeferred + '.has(' + this._deferredIndex + ')){' );
		return this.addLocal();
	},

	_endWait: function( local, nobreak ) {
		this.code.push( this._chtDeferred + '.set(' + this._deferredIndex + ',' + local + '=' + this.popExpression() + ');}else ' + 
						local + '=' + this._chtDeferred + '.get(' + this._deferredIndex + ');' );
		if( !nobreak )
			this.code.push( 'if(' + local + ' instanceof ' + this.addGlobal( dojo.Deferred ) + ')break;' );

		this._deferredIndex++;

		this.expressions.push( local );
	},

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
					throw Error( '<?group?> should have one of attributes: key=, count=' );
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
		},

		"when": {
			sections: { "" : {allowArgument:true}, "else": {} },

			_tag: dojo.extend( 
				function( cht, elt ) {
					this.arg = elt.arg ? cht.qplus.parse( elt.arg ) : dj.tags.current();
					this.ifReady = elt.body;
					if( elt.sections.length )	
						this.ifNotReady = elt.sections[0].body;
				}, {
					compile: function( self ) {

						var flag;

						if( self.ifNotReady ) {
							flag = this.addLocal();
							this.code.push( flag + '=true;' );
						}

						this.code.push( 'do{' );

						this._openWait = this._beginWait();

						if( self.arg )			this.compile( self.arg );
						else					this.generator();

						if( this._openWait ) {
							this._endWait( this._openWait );
							delete this._openWait;
						}

						var	result = this.popExpression(),
							lock = this.addLocal();

						if( lock != result )
							this.code.push( lock + '=' + result + ';' );
	
						this.nonAccumulated( function() {
							this.compileSequence( self.ifReady );
						}, '(' + lock + ')' );

						this.locals.pop();
						
						this.code.push( '}while(' + ( self.ifNotReady ? flag + '=' : '' ) + 'false);' );
						
						if( self.ifNotReady ) {
							this.code.push( 'if(' + flag + '){' );
							this.compileSequence( self.ifNotReady );
							this.code.push( '}' );
							this.locals.pop();
						}
					}
				}
			),
			
			tag: function( cht, elt ) {	return new this._tag( cht, elt ); }
		}
	},

	string: dojox.jtlc.qplus.prototype.string,
	queryLanguage: dojox.json.query,

	_declareTag: dj._declareTag,

	tags: dojo.delegate( dj.qplus.prototype.tags, {} )
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

		compileArgs: function( self ) {
			for( var i=self.args.length-1; i >= 0; --i )
				this.compile( self.args[i] );
		},

		compile: function( self ) {
			if( !( '_pushLiteralOptimizer' in this.optimizers ) )
				this.optimizers._pushLiteralOptimizer = self.optimize;

			if( self.args.length ) {
				this._replaceFunction = this._replaceFunction || this.addGlobal( dj._replaceN );
				self.compileArgs.call( this, self, true );
				this.expressions.push( this._replaceFunction + '(' + self.formatString.call( this, self ) + ',' + self.argumentList.call( this, self ) + ')' );
			} else {
				this.expressions.push( self.formatString.call( this, self ) );
			}
		},

		optimize: function( body ) {
			var acc = this._chtHTML,
				outer_regex = new RegExp(
					'[;}{](?:' + acc + '\\.push\\({1,2}"(?:[^"\\\\]|\\\\.)*"\\){1,2};){2,}',
					"g"
				),
				inner_regex = new RegExp(
					acc + '\\.push\\({1,2}"((?:[^"\\\\]|\\\\.)*)"\\){1,2};', "g"
				);

			return dojox.jtlc.replaceWithinJavascript(
				body, outer_regex, function( seq ) {
					return seq.substr( 0, 1 ) + acc + '.push("' +
						   seq.substr( 1 ).replace( inner_regex, '$1' ) + '");';
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
			var	d = this.i18nDictionary;
			return dj.stringLiteral( 
				d && ( self.format in d ? d[self.format] :
					self.format.replace( /^(\s*)(.*?)(\s*)$/, function( _, pfx, key, sfx ) {
						if( !( key in d ) )	d[key] = false;
						return d[key] ?	(pfx||'') + d[key] + (sfx||'') : '';
					} )
				) || self.format
			);
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
				var regex = new RegExp( 'String\\(("(?:\\\\.|[^\\\\"])*")\\)\\.replace\\(' + replace_params + '\\)', 'g' );
				this.optimizers['_escape' + self.cachePrefix + 'Optimizer'] = function( body ) {
					return dojox.jtlc.replaceWithinJavascript( body, regex, '$1' );
				}
			}

			this.compile( self.arg );
			var	what = this.popExpression();
			if( !/^\(.*\)$/.test( what ) )
				what = '(' + what + ')';
			this.expressions.push( 'String' + what + '.replace(' + replace_params +	')' );
		}
	} );

	function makeEscapeTag( cls ) { 
		return function(arg) { 
			return arg instanceof djcp.tags._raw || arg instanceof djcp.tags._do ? 
				arg : new cls( arg );
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
			this.code.push( this._chtRefs.refs + '.push(' + this.popExpression() + ');' );
			this._replaceFunction = this._replaceFunction || this.addGlobal( dj._replaceN );

			this.expressions.push( 
				this._replaceFunction + '("dojo.getObject(\\"_refs.{0}.{1}\\")",' + this._chtRefs.index + ',' + this._chtRefs.refs + '.length-1)' 
			);
			this._hasRefs = true;
		}
	} );

	djcp._declareTag( 'wait', {
		constructor: function( arg ) {
			this.arg = arg;
		},
		compile: function( self ) {

			var	w = this._openWait;
			if( !w )	w = this._beginWait();
			else		delete this._openWait;

			this.compile( self.arg );

			this._endWait( w );
		}
	} );

	djcp._declareTag( 'markDom', dojo.declare( djcp.tags._raw, {
		constructor: function( elt_tag ) {
			this.markerElement = elt_tag;
		},

		compile: function( self ) {

			if( !this._chtMarkerID ) {
				this._chtMarkerID = this.addLocal();
				this.code.push( this._chtMarkerID + '=' + this.addGlobal( dj._chtGlobalContext ) + '.markerID++;' );
				this._chtMarkerQuery = '(' + dj.stringLiteral( self.markerElement + '.' + this.domMarkerPrefix ) + '+' + this._chtMarkerID + ')';
			}

			this.expressions.push( '(' + 
				dj.stringLiteral( dj._replaceN( '<{0} style="display:none" class="{1}', self.markerElement, this.domMarkerPrefix ) ) + 
				'+' + this._chtMarkerID + '+' +
				dj.stringLiteral( dj._replaceN( '"></{0}>', self.markerElement ) ) +
			')' );
		}
	} ) );

})( dojox.jtlc.CHT.prototype );

