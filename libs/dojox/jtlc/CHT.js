// Copyright (C) 2013-2014 12 Quarters Consulting
// Copyright (C) 2010-2013 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "dojox.jtlc.CHT" );

dojo.require( "dojox.jtlc.CHT.scanner" );
dojo.require( "dojox.jtlc.CHT.instance" );
dojo.require( "dojox.jtlc.CHT.elements" );
dojo.require( "dojox.jtlc.CHT.tags" );
dojo.require( "dojox.jtlc.CHT.p11nAlgorithm" );

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

var uniqueModuleId = 0;

dojo.declare( 'dojox.jtlc.CHT', dj._qplusL, {

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

		if( !settings.p11nAlgorithm )
			settings.p11nAlgorithm = this.p11nAlgorithm;

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
			this._buildTemplates( input, ns, url || ('[CHT-Templates-' + (++uniqueModuleId) + ']') ),
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
							!/^[a-z_]\w*$/i.test( elt.arg||'' ) && (elt.openTag != 'section' || elt.arg) )
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
						if( elt.openTag )
							refs[elt.openTag] = false;
						body.push( elt );
					}
				} else if( t ) {
					if( !current ) {
						if( !/^(?:\s|\n)+$/.test( t ) )
							throw Error( 'HTML content encountered outside template: ' + t );
					} else {
						t = _this._parseTextWithSubstitutions( t );
					
						if( body.length && body[body.length-1] instanceof dj.tags._quote &&
							t.length == 1 && t[0] instanceof dj.tags._quote 
						)
							body[body.length-1].value += t[0].value;
						else
							body.push.apply( body, t );
					}
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

	_parseTextWithSubstitutions: function( t, is_attr ) {
		var substitutions = [], injections = [], _this = this;

	 	t = t.replace( /\ufffd([\s\S]*?)\ufffd/g, 
			function( _, subst ) {
				var	s = _this.qplus.parse( subst );
				
				if( s.makeVoid ) {
					injections.push( s );
					return '';
				}
				
				substitutions.push(
					is_attr ? 
						s
					: t.charAt(0)=='<' ? 
							/^<script/i.test( t ) ?
								s : _this.tags.escapeAttribute( s )
							:
								_this.tags.escapeText( s )
				);

				return '{' + (substitutions.length-1).toString() + '}';
			}
		);

		if( !is_attr && t.charAt(0) != '<' && /\b(?:[a-zA-Z][a-z]*|[A-Z]+)\b/.test( t.replace( /&[a-z]+;/g,'-' ) ) )
			injections.push( this.tags.i18n( t, substitutions ) );
		else if( substitutions.length == 0 ) {
			if( is_attr || t && (injections.length == 0 || /\S/.test( t )) )
				injections.push( dj.tags.quote( t ) );
		} else if( t == '{0}' )	
			injections.push( substitutions[0] );
		else
			injections.push( this.tags.replaceN( t, substitutions ) );

		return injections;
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

			function unwrapFromContext( body ) {
				body.unshift( _this._contextSwitch( refs[tag].context, 'exit' ) );
				body.push( _this._contextSwitch( refs[tag].context, 'enter' ) );
			}

			function qualify( tag ) {
				if( tag.indexOf('.') < 0 && !refs[tag] ) {
					for( var i=0; i<stack.length; ++i ) {
						var alt = body[stack[i]].openTag.replace( /\.[^.]+$/, '' );
						if( alt && refs[ alt = alt + "." + tag ] ) return alt;
					}
					return null;
				}
				return tag;
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
						body[i] = new _this._userDefinedSection( body[i].arg, parseDefinition( body[i].body ), ns[elt_name].sourceUrl );
						continue;
					}

					if( section && body[i].closeTag )
						throw Error( 'Closing tags not allowed for sections: ' + body[i].text );

					if( body[i].openTag ) {
						if( section ) {
							body[i].openTag = tag;
							if( body[i].arg && !section.allowArgument )
								throw Error( 'Argument not allowed here: ' + body[i].text );
							if( !section.allowMultiple && dojo.some( parent.sections, function(s){ return s.openTag == tag; } ) )
								throw Error( 'Section appears more than once: ' + body[i].text );
							body[stack[0]].body = body.splice( stack[0]+1, i - stack[0] - 1 );
								i = stack[0] + 1;

							if( body[stack[0]] !== parent )	{
								body.splice( stack.shift(), 1 );
								--i;
							}

							parent.sections.push( body[i] );
							stack.unshift( i );
						} else {
							if( !(tag = qualify(tag)) )
								throw Error( 'Unknown CHT element: ' + body[i].text );

							body[i].openTag = tag;

							if(
								(def_sections = refs[tag].sections) && // Hook for CHT loader follows
								(typeof def_sections !== 'function' || (def_sections = def_sections( body[i] )))
							) {
								stack.unshift( i );
								body[i].def_sections = def_sections;
								body[i].sections = [];
							} else { // non-sectioned element (widget)
								body[i] = refs[tag].tag( _this, body[i], null, refs[tag].context );
							}
						}
					} else { // body[i].closeTag
						if( !parent || parent.openTag != tag && parent.openTag.replace( /^.*\./, '' ) != tag )
							throw Error( 'Unbalanced closing tag: ' + body[i].text );
						else
							tag = parent.openTag;

						body[stack[0]].body = body.splice( stack[0]+1, i - stack[0] - 1 );
						i = stack[0] + 1;

						if( body[stack[0]] !== parent )	{
							body.splice( stack.shift(), 1 );
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

						body[stack.shift()] = refs[tag].tag( _this, parent, ns[elt_name], refs[tag].context );
						body.splice( i--, 1 );

						if( refs[tag].context ) {
							dojo.forEach( parent.sections, function(s){ unwrapFromContext( s.body ); } );
							if( parent.body && parent.body.length )	unwrapFromContext( parent.body );
						}
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

		if( !this._chtSections )
			this._chtSections = {};
		this._deferredIndex = 0;

		var def_code_idx = this.code.length;
		this._chtDeferred = this.addLocal();
		this.code.push( this._chtDeferred + '=new ' + this.addGlobal( dj._CHTDeferredAccessor ) + '(this,$self);' );

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
			this._chtDeferred + '.instance?' + this.addGlobal( dojo.mixin ) + '(this.$CHT,{' +
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
		
		var old_sink = this.sink;
		this.sink = new dj._NullSink( this );

		dojo.forEach( body, function(v) {
			if( v.makeVoid )	v.makeVoid();
			this.compile( v );
			this.sink.append();
		}, this );

		if( old_sink )	this.sink = old_sink;
		else			delete this.sink;
	},

	replaceLanguage:	dojo.replace,

	_appendToOutput: dojo.extend(
		function( body ) {
			this.body = body;
		},{
			compile: function( self ) {
				dojo.forEach( self.body, function(v) {
					if( v.makeVoid )	v.makeVoid();
					this.compile( v );
					if( v.makeVoid )
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

	_inContext: function( ctx, what ) {
		return {
			compile: function() {
				ctx.enter( this );
				this.compile( what );
				ctx.exit( this );
			}
		}
	},

	_userDefinedElement: dj.CHT.userDefinedElement,

	_attributeSlots: function( elt ) {
		var	v = {},
			any = false,
			except = {};

		for( var i=1; i<arguments.length; ++i )
			except[arguments[i]] = true;

		for( var s in elt.kwarg )
			if( !except[s] ) {
				v[s] = elt.kwarg[s].parse( this );
				any = true;
			}

		return any && { attributes: dojox.jtlc.tags.extend( v ) };
	},

	_userDefinedSection: dojo.extend(
		function( name, body, tpl_url ) {
			this.body = body;
			this.name = name;
			this.tplUrl = tpl_url;
		}, {
			compile: function( self ) {
				this.compileSequence( (this._chtSections[self.tplUrl]||{})[self.name] || self.body );
			}
		}
	),

	_beginWait: function( local ) {
		this.code.push( 'if(!' + this._chtDeferred + '.has(' + this._deferredIndex + ')){' );
		return local || this.addLocal();
	},

	_endWait: function( local, nobreak ) {
		this.code.push( 
			local + '=' + this._chtDeferred + '.set(' + 
				this._deferredIndex + ',' + this.popExpression() + 
				( this._whenCtx && this._whenCtx.hasExcept ? ',true' : '' ) +
			');}else ' + 
				local + '=' + this._chtDeferred + '.get(' + this._deferredIndex + ');' 
		);
		if( !nobreak )
			this.code.push( 'if(' + 
				local + '.then' + 
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
	p11nAlgorithm: dj.CHT.p11nAlgorithm
});

})();

