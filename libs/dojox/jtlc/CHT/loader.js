/*
   CHT loader with support for template libraries and localization bundles
*/

dojo.provide( 'dojox.jtlc.CHT.loader' );
dojo.require( 'dojox.jtlc.CHT' );
dojo.require( 'dojo.i18n' );
dojo.require( 'dojo.DeferredList' );

dojox.jtlc.CHT.loader = (function() {

	var	d = dojo, dj = dojox.jtlc;

	var SplitName = dojo.extend( 
		function( mdl, file, tpl ) {
			this.moduleName = mdl;
			this.fileName = file;
			if( tpl ) this.templateName = tpl;
		}, {
			_extModuleName: function( ext ) {
				return this.moduleName ? this.moduleName + "." + ext : ext;
			},

			url: function() {
				return d.moduleUrl( this._extModuleName( "CHT" ), this.fileName + ".cht" ).toString();
			},

			namespace: function() {
				return this._extModuleName( this.fileName );
			},

			nlsBundle: function() {
				try {
					d.requireLocalization( this._extModuleName( "CHT" ), this.fileName );
					return d.i18n.getLocalization( this._extModuleName( "CHT" ), this.fileName );
				} catch( e ) { return {}; }
			},

			sourceText: function() {
				if( this.url() in (d.global.preloadedCHT || {}) )
					return d.global.preloadedCHT[this.url()];
				return d.xhrGet({ url: this.url() });
			}
		}
	);

	function splitModuleName( mdl_name ) {
		var spl = mdl_name.split( '.' );
		return new SplitName( spl.length > 1 ? spl.slice( 0, spl.length-1 ).join( '.' ) : "", spl[spl.length-1] );
	}

	function splitTemplateName( tpl_name ) {
		var spl = tpl_name.split( '.' );
		if( spl.length < 2 )	throw Error( 'Template module name is missing in reference to ' + tpl_name );
		return new SplitName( 
			spl.length > 2 ? spl.slice( 0, spl.length-2 ).join( '.' ) : "", 
			spl[spl.length-2], spl[spl.length-1]
		);
	}

	function waitingList( list ) {
		if( list.length == 0 )	return list;
		if( list.length == 1 )	return list[0];
		return new d.DeferredList( list );
	}

	function setAt( obj, slot ) {
		return function( val ){ obj[slot] = val; };
	}

	function whenAll( /* deferred? ..., handler */ ) {

		var	args = dj._copyArguments( arguments ),
			deferred = [],
			handler = args.pop();

		for( var i=0; i<args.length; ++i )
			if( typeof args[i] === 'object' && args[i].then )
				deferred.push( d.when( args[i], setAt( args, i ) ) );

		return d.when( waitingList( deferred ), function() {
			return handler.apply( null, args );
		} );
	}

	function deferredFunction( fn, deferred ) {
		fn.then = function( /* callbacks */ ) {
			return deferred.then.apply( deferred, arguments );
		}
		return fn;
	}

	function mergeNlsBundles( to, from ) {
		for( var i in from )
			if( from[i] && !to[i] )	to[i] = from[i];
	}

	var cache = {},	queue = {}, cht_instance = null;

	function chtInstance() {
		if( !cht_instance )	cht_instance = new dj.CHT( { loadTemplates: loadTemplates } );
		return cht_instance;
	}

	function enqueue( mdl, cached ) {

		if( !cached ? mdl in cache : mdl in cached.overrides ) 
			return cache[mdl];

		if( mdl in cache )	cache[mdl].compiled = {}; // Discard anything that might have compiled

		if( mdl in queue ) // Assume that overrides are used only once
			return d.when( queue[mdl], function(){ return cache[mdl]; } );

		var	sn = splitModuleName( mdl ),
			parsed = whenAll(
				cached, sn.sourceText(),
				function(cached_ready,src) {
					cached = cached_ready;
					return chtInstance().parse( src, cached && cached.parsed, sn.url() );
				}
			);
		if( parsed.then )	queue[mdl] = parsed;
		var nls = sn.nlsBundle();	// Synchronous, so do it after all async processes have started

		return d.when( parsed, function( parsed ) {
			if( !cached )	
				cache[mdl] = { 
					parsed: parsed,
					compiled: {},
					nls: nls,
					overrides: {}
				};
			else {
				mergeNlsBundles( cached.nls, nls );
				cached.overrides[mdl] = true;
			}
			if( queue[mdl] )	delete queue[mdl];
			return cached || cache[mdl];	
		} );
	}

	function loadTemplates( refs ) {

		var namespaces = {}, deferred = [];

		for( var tpl in refs ) {
			var sn = splitTemplateName( tpl );
			if( !(sn.namespace() in namespaces) )
				namespaces[sn.namespace()] = [];
			namespaces[sn.namespace()].push( sn.templateName );
		}
		
		for( var ns in namespaces ) {
			var def = d.when(
				cache[ns] || enqueue( ns ),
				function( cached ) {
					d.forEach( namespaces[ns], function( tpl ) {
						if( !(tpl in cached.parsed) )
							throw Error( '<?' + tpl + '?> is not defined in ' + ns );
						refs[ns + '.' + tpl] = cached.parsed[tpl];
					} );
				}
			);
					
			if( def && def.then )	deferred.push( def );
		}

		return d.when( waitingList( deferred ), function() {
			return refs;
		} );
	}

	function getTemplate( sn ) {
		var cached = cache[sn.namespace()];

		if( !(sn.templateName in cached.compiled) ) {
			if( !(sn.templateName in cached.parsed) )
				throw Error( '<?' + sn.templateName + '?> is not defined in ' + sn.namespace() );
			cached.compiled[sn.templateName] = 
				dj.compile(
					cached.parsed[sn.templateName],
					chtInstance(),
					{ i18nDictionary: cached.nls }
				);
		}

		return cached.compiled[sn.templateName];					
	}

	function deferGetTemplate( cached, sn ) {

		var deferredTemplateInstance = dojo.extend( 
			function( args ) {
				this.args = dj._copyArguments( args );
			}, {
				render: function( /* render args */ ) {
					var render_args = dj._copyArguments( arguments ),
						evaluator_args = this.args;
					return d.when( cached, function() {
						var inst = getTemplate( sn ).apply( null, evaluator_args );
						return inst.render.apply( inst, render_args );
					} );
				}
			}
		);

		return deferredFunction( function( /* evaluator args */ ) {
			d.when( cached, function( cached_value ) { cached = cached_value; } );
			return cached.then ? new deferredTemplateInstance( arguments ) :
								 getTemplate( sn ).apply( null, arguments );
		}, cached );
	}

	return {
		initCompiler: function( opts ) {
			cht_instance = new dj.CHT( d.mixin( {}, opts, { loadTemplates: loadTemplates } ) );
		},

		require: function( /* tpl_module_with_overrides... */ ) {
			var result = [];
			for( var i=0; i<arguments.length; ++i ) {
				var	cached;
				d.forEach( arguments[i].split('+'), function( mdl ) {
					cached = enqueue( mdl, cached );
				} );
				if( cached.then )	result.push( cached );					
			}
			return waitingList( result );
		},

		get: function( tpl ) {
			var sn = splitTemplateName( tpl ),
				cached = enqueue( sn.namespace() );

			return cached.then ? deferGetTemplate( cached, sn ) : getTemplate( sn );
		}
	};
})();
