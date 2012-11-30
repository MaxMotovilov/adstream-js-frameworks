// Copyright (C) 2010-2012 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "dojox.jtlc.CHT" );

dojo.require( "dojox.jtlc.CHT.scanner" );
dojo.require( "dojox.jtlc.CHT.instance" );
dojo.require( "dojox.jtlc.CHT.elements" );
dojo.require( "dojox.jtlc.CHT.tags" );

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

		if( !settings )
			settings = {};
		if( settings.elements )
			settings.elements = dojo.mixin( {}, this.elements, settings.elements );
		if( settings.tags )
			settings.tags = dojo.mixin( {}, this.tags, settings.tags );

		dojo.mixin( this, settings );

		if( !settings.tags )
			settings.tags = this.tags;

		this.qplus = new dj.qplus( settings );
	},

	parse: function( input, ns, url ) {

		if( typeof ns === 'string' ) {
			url = ns;
			ns = {};
		} else if( !ns )	
			ns = {};

		if( typeof input === 'string' )
			input = [ { src: input } ];

		return dojo.when( 
			this._buildTemplates( input, ns, url || '[CHT-Templates]' ),
			dojo.hitch( this, '_buildAST', ns )
		);
	},

	/*
		Stage I: split tokenized input into individual template definitions.

		When this function executes, not all external references may be satisfied.
		It is impossible to fully parse the CHT as we don't yet know which elements
		may require a closing tag!
	*/
	_buildTemplates: function( input, ns, url ) {

		var	_this = this,
			refs = {},
			parsed = {},
			tos = { 'template':1, 'section':1 };

		function markDom( elt ) {
			if( elt.markerElement )	body.push( _this.tags.markDom( elt.markerElement ) );
		}

		for( var i=0; i<input.length; ++i ) {

			var current = null,
				body = null;

			dojo.forEach( dj._tokenizeCHT( input[i].src ), function( t ) {
				if( t.substr( 0, 2 ) == '<?' ) {
					var	elt = new dj._CHTElement( t );
					if( !current && elt.openTag != 'template' )
						throw Error( 'CHT element encountered outside template: ' + t );
					if( current && elt.openTag == 'template' )
						throw Error( 'Missing end of previous template at: ' + t );

					if( elt.closeTag == 'template' ) {
						markDom( current );
						if( !ns.hasOwnProperty(current.arg) )
							ns[current.arg] = new this._userDefinedElement( current, ( input[i].url || url ) + '/<?' + current.arg + '?>' );
						current = body = null;
					} else if( elt.openTag in tos ) {
						if( elt.arg in tos || elt.arg in _this.elements ||
							!/^[a-z]\w*$/i.test( elt.arg||'' ) && (elt.openTag != 'section' || elt.arg) )
							throw Error( 'Bad or missing name for CHT ' + elt.openTag + ': ' + t );
						if( elt.openTag == 'template' ) {
							current = elt;
							if( !(elt.arg in parsed) )	parsed[elt.arg] = elt;
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
		}

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
	_buildAST: function( ns, rp ) {

		var	refs = dojo.mixin( rp.refs, ns, this.elements ),
			_this = this;

		function parseDefinition( body ) {
			var	stack = [],
				lit_seq_start = -1;

			function wrapInContext( at ) {
				if( refs[tag].context ) {
					body.splice( at, 1, 
						_this._contextSwitch( refs[tag].context, 'enter' ),
						body[at],
						_this._contextSwitch( refs[tag].context, 'exit' )
					);
					i += 2;
					return true;
				}
				return false;
			}

			function unwrapFromContext( body ) {
				body.unshift( _this._contextSwitch( refs[tag].context, 'exit' ) );
				body.push( _this._contextSwitch( refs[tag].context, 'enter' ) );
			}

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
						parent, def_sections,
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
						} else if(
							(def_sections = refs[tag].sections) && // Hook for CHT loader follows
							(typeof def_sections !== 'function' || (def_sections = def_sections( body[i] )))
						) {
							stack.unshift( i );
							body[i].def_sections = def_sections;
							body[i].sections = [];
						} else { // non-sectioned element (widget)
							body[i] = refs[tag].tag( _this, body[i] );
							wrapInContext( i );
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

						if( wrapInContext( stack[0] ) ) {
							dojo.forEach( parent.sections, function(s){ unwrapFromContext( s.body ); } );
							if( parent.body && parent.body.length )	unwrapFromContext( parent.body );
						}

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
		this.code.push( this._chtDeferred + '=new ' + this.addGlobal( dj._CHTDeferredAccessor ) + '(this._cht);' );

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
			'this._cht instanceof ' + cons + '?' + this.addGlobal( dojo.mixin ) + '(this._cht,{' +
				baseProps( this._hasRefs ) +
				( this._chtMarkerQuery ? ',_marker_query:' + this._chtMarkerQuery : '' ) +
			'}):new ' + cons + '({' + baseProps( this._hasRefs ) +
				( this._chtMarkerQuery ? ',_marker_query:' + this._chtMarkerQuery : '' ) +
				',_self:$self,_this:this,_args:$,_deferred:' + this._chtDeferred + '.storage,_max_deferred:' + this._deferredIndex +
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

	_contextSwitch: function( ctx, mtd ) {
		mtd = dojo.hitch( ctx, mtd );
		return {
			compile: function(){ mtd( this ); }
		}
	},

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
								local = this.addLocal();
								if( new_input.length > 4 ) {
									this.code.push( local + '=' + new_input + ';' );
									new_input = '(' + local + ')';
								} else if( new_input === local ) {
									new_input = '(' + new_input + ')';
								} else {
									this.locals.pop();
									local = null;
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
					if( elt.arg )	this.arg = cht.qplus.parse( elt.arg );
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
						
						self._compile.call( this,
							this.addGlobal( this.compiledTemplates[self.name] ),
							self.arg,
							this.compiledTemplates[self.name].async
						);
					},

					// This function is also used by the <?embed?> tag
					_compile: function( fn, arg, is_deferred ) {
						var	v, w;

						if( is_deferred )	w = this._beginWait();

						if( arg )	this.compile( arg );
						else		this.generator();

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

	_beginWait: function( local ) {
		this.code.push( 'if(!' + this._chtDeferred + '.has(' + this._deferredIndex + ')){' );
		return local || this.addLocal();
	},

	_endWait: function( local, nobreak ) {
		this.code.push( 
			this._chtDeferred + '.set(' + 
				this._deferredIndex + ',' + local + '=' + this.popExpression() + 
				( this._whenCtx && this._whenCtx.hasExcept ? ',true' : '' ) +
			');}else ' + 
				local + '=' + this._chtDeferred + '.get(' + this._deferredIndex + ');' 
		);
		if( !nobreak )
			this.code.push( 'if(' + 
				local + ' instanceof ' + this.addGlobal( dojo.Deferred ) + 
				( this._whenCtx && this._whenCtx.hasExcept ?
					('||' + local + ' instanceof Error')
				: '' ) +
			')break;' );

		this._deferredIndex++;

		this.expressions.push( local );
	},

	// at this point, dojox.jtlc.CHT.tags and dojox.jtlc.CHT.elements are not yet overwritten!
	tags: dojo.delegate( dj.qplus.prototype.tags, dj.CHT.tags ),
	elements: dj.CHT.elements,

	string: dojox.jtlc.qplus.prototype.string,
	queryLanguage: dojox.json.query
});

})();

