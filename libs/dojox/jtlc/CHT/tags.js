// Copyright (C) 2010-2012 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( 'dojox.jtlc.CHT.tags' );
dojo.require( 'dojox.jtlc.tags' );

(function() {
	
	var dj = dojox.jtlc;

	dj.CHT._declareTag = dj._declareTag;

	function _renderAttributeDict( dict ) {

		if( !dict )	return "";
		if( typeof dict !== 'object' )
			throw Error( "attributes() expects a dictionary" );

		var v = [];
		for( var a in dict )
			if( dict[a] === null || dict[a] === false || typeof dict[a] === "undefined" )
				;
			else if( dict[a] === true )
				v.push( a )
			else
				v.push( 
					a + '="' +
					dict[a].toString().replace(
						dj.CHT.prototype.tags._escapeAttribute.prototype.escapeRegex,
						dj.CHT.prototype.tags._escapeAttribute.prototype.escapeFn
					) + '"' 
				);
		return v.join( ' ' );
	}

	dj.CHT._declareTag( 'foreachBody', {

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
		},

		makeVoid: function() {}
	} );

	dj.CHT._declareTag( 'genericBody', {
		constructor: function( body, arg ) {
			this.body = body;
			if( arg )	this.arg = arg;
		},

		compile: function( self ) {
			var arg, v;

			if( self.arg ) {
				this.compile( self.arg );
				arg = this.popExpression();
				v = this.addLocal();
			}

			this.nonAccumulated( function() {
				this.compileSequence( self.body );
			}, v );

			if( v )	this.locals.pop();
			if( !self.isVoid )	this.generator();
		},

		makeVoid: function() { this.isVoid = true; }
	} );

	dj.CHT._declareTag( 'replaceN', dojo.declare( dj._MultiArgTag, {
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

	dj.CHT._declareTag( 'i18n', dojo.declare( dj.CHT.tags._replaceN, {
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
			this.expressions.push( 'String(' + what + ').replace(' + replace_params +	')' );
		}
	} );

	function makeEscapeTag( cls ) { 
		return function(arg) { 
			return arg instanceof dj.CHT.prototype.tags._raw || arg instanceof dj.CHT.prototype.tags._do ? 
				arg : new cls( arg );
		}
	}

	dj.CHT._declareTag( 'escapeAttribute', dojo.declare( escapeTag, {
		
		cachePrefix: 'Attr',

		escapeRegex: /[<>'"&]/g,

		escapeFn: function(x) { 
			return { "<": '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;', '&': '&amp;' }[x];
		}
	} ), makeEscapeTag );

	dj.CHT._declareTag( 'escapeText', dojo.declare( escapeTag, {
		
		cachePrefix: 'Text',

		escapeRegex: /[<>&]/g,

		escapeFn: function(x) { 
			return { "<": '&lt;', '>': '&gt;', '&': '&amp;' }[x];
		}
	} ), makeEscapeTag );

	dj.CHT._declareTag( 'raw', {
		constructor: function( arg ) {
			this.arg = arg;
		},
		compile: function( self ) {
			this.compile( self.arg );
		}
	} );

	dj.CHT._declareTag( 'ref', {
		constructor: function( arg ) {
			this.arg = arg;
		},
		compile: function( self ) {
			this.compile( self.arg );
			this._replaceFunction = this._replaceFunction || this.addGlobal( dj._replaceN );

			this.expressions.push( 
				this._replaceFunction + '("dojo.getObject(\\"_refs.{0}.{1}\\")",' + 
				this._chtRefs.index + ',' + this._chtRefs.refs + '.push(' + this.popExpression() + ')-1)'
			);

			this._hasRefs = true;
		}
	} );

	dj.CHT._declareTag( 'wait', {
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

	dj.CHT._declareTag( 'markDom', dojo.declare( dj.CHT.tags._raw, {
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

	dj.CHT._declareTag( 
		'attributes', 
		dojo.declare( [dj.CHT.tags._raw, dj.tags._bind], {} ),
		function( cls ) {
			return function() {
				var args = arguments;
				return new cls( 
					_renderAttributeDict,
					dj.CHT.prototype.tags.expr.apply( dj.CHT.prototype.tags, args )
				);
			}
		}
	);

})();

