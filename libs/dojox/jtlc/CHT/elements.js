// Copyright (C) 2010-2012 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "dojox.jtlc.CHT.elements" );

dojox.jtlc.CHT.elements = (function() {
	var	dj = dojox.jtlc;

	return {	
		"embed": {
			_tag: dojo.extend(
				function( cht, elt ) {
					if( !elt.kwarg.template )
						throw Error( "<?embed?> must have the attribute \"template=\"" );

					this.runtimeError = new Error( '"' + elt.kwarg.template + '" did not resolve to a template' );

					// Note that this.template could be replaced by the <?load?> implementation!
					this.template = elt.kwarg.template.parse( cht );
				
					if( elt.arg )
						this.arg = elt.arg.parse( cht );
					this.async = elt.kwarg.async !== 'false';
				
					// Stealing a method to avoid the complexity of inheritance
					this._compile = cht._userDefinedElement.prototype._compiledTag.prototype._compile;
				},{
					compile: function( self ) {
						this.compile( self.template );
					
						// Relying on _compile() to only use its first argument once
						self._compile.call( this, this.popExpression(), self.arg, self.async );
					
						var cons = this.addGlobal( dj._CHTTemplateInstance ),
							err  = this.addGlobal( self.runtimeError );
					
						this.code.push(
							'if(!(' + this._chtHTML + '[' +
								this._chtHTML + '.push(' + this.popExpression() +
							')-1]) instanceof ' + cons + ') throw ' + err + ';'
						);
					}
				}
			),
		
			tag: function( cht, elt ) {	return new this._tag( cht, elt ); }
		},

		"scope": {
			sections: {	"" : {allowArgument:true} },

			_tag: dojo.extend(
				function( body, arg ) {
					this.body = body;
					if( arg )	this.arg = arg;
				}, {
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
					}
				}
			),

			tag: function( cht, elt ) {
				var body = new this._tag( elt.body, elt.arg && elt.arg.parse( cht ) ),
					slots = {};

				for( var s in elt.kwarg )
					slots[s] = elt.kwarg[s].parse( cht );

				return dojox.jtlc.tags.scope( body, slots );
			}
		},

		"if": {
			sections: {	"" : {allowArgument:true}, "elseif" : {allowArgument:true,allowMultiple:true}, "else": {} },

			_tag: dojo.extend( 
				function( cht, elt ) {
					this.ifTrue = [ {
						condition: elt.arg ? elt.arg.parse( cht ) : dj.tags.current(),
						body: elt.body
					} ];

					dojo.forEach( elt.sections, function(s) {
						if( s.openTag == 'elseif' )
							this.ifTrue.push( {
								condition: s.arg ? s.arg.parse( cht ) : dj.tags.current(),
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
					cht.tags.foreachBody( elt.body, elt.arg && elt.arg.parse( cht ) )
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
							elt.kwarg.key.parse( cht, true ) :
							dj.tags.expr( 'Math.floor($#/(' + elt.kwarg.count + '))' ),
						cht.tags.genericBody( elt.body ),
						elt.arg ? elt.arg.parse( cht ) : dj.tags.current()
					)
				) );
			}
		},

		"when": {
			sections: { "" : {allowArgument:true}, "else": {}, "except": {} },

			_tag: dojo.extend( 
				function( cht, elt ) {
					this.arg = elt.arg 
						? elt.arg.parse // Hook for the CHT loader
							? elt.arg.parse( cht ) 
							: elt.arg
						: dj.tags.current();
					this.ifReady = elt.body;
					dojo.forEach( elt.sections, function(s) {
						if( s.openTag == 'else' )
							this.ifNotReady = s.body;
						else
							this.ifFailed = s.body;
					}, this );
				}, {
					compile: function( self ) {

						var old_when_ctx;
						if( old_when_ctx = this._whenCtx )	
							delete this._whenCtx;

						if( self.ifNotReady || self.ifFailed ) {
							this._whenCtx = { flagVar: this.addLocal(), hasExcept: self.ifFailed && true };
							this.code.push( this._whenCtx.flagVar + '=true;' );
						}

						this.code.push( 'do{' );

						this._openWait = this._beginWait( this._whenCtx && this._whenCtx && this._whenCtx.flagVar );

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
					
						this.code.push( '}while(' + ( this._whenCtx ? this._whenCtx.flagVar + '=' : '' ) + 'false);' );
					
						if( self.ifFailed ) {
							this.code.push( 'if(' + this._whenCtx.flagVar + ' instanceof Error){' );
							this.nonAccumulated( function() {
								this.compileSequence( self.ifFailed );
							}, '(' + this._whenCtx.flagVar + ')' );
							this.code.push( '}' );
						}

						if( self.ifNotReady ) {
							this.code.push( (self.ifFailed ? 'else ' : '') + 'if(' + this._whenCtx.flagVar + '){' );
							this.compileSequence( self.ifNotReady );
							this.code.push( '}' );
						}

						if( old_when_ctx )			this._whenCtx = old_when_ctx;
						else if( this._whenCtx )	delete this._whenCtx;
					}
				}
			),
		
			tag: function( cht, elt ) {	return new this._tag( cht, elt ); }
		}
	}
})();

