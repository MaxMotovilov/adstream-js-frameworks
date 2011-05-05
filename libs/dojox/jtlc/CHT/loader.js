// Copyright (C) 2010-2011 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/dojox.jtlc/wiki/License

/*
   CHT loader with support for template libraries and localization bundles
*/

dojo.provide( 'dojox.jtlc.CHT.loader' );
dojo.require( 'dojox.jtlc.CHT' );
dojo.require( 'dojo.i18n' );
dojo.require( 'dojo.DeferredList' );

dojox.jtlc.CHT.loader = (function() {

	var	d = dojo, dj = dojox.jtlc;

	var SplitName = d.extend( 
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

	function apply( this_object, method, args )	{
		return this_object[method].apply( this_object, args );
	}

	var WaitingList = d.extend(
		function() { this.list = []; },
		{
			push: function( v ) {
				if( v.then )	this.list.push( v );
				return v;
			},

			then: function() {
				if( this.list.length == 0 )	return arguments[0]([]);
				if( this.list.length == 1 )	return apply( this.list[0], 'then', arguments );
				return apply( new d.DeferredList( this.list ), 'then', arguments );
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

	function deferredFunction( fn, deferred ) {
		fn.then = function( /* callbacks */ ) {
			return deferred.then.apply( deferred, arguments );
		}
		return fn;
	}

	function mergeNlsBundles( to, from ) {
		for( var i in from )
			if( from[i] )	to[i] = from[i];
	}

	var cache = {},	cht_instance = null;

	function chtInstance() {
		if( !cht_instance )	cht_instance = new dj.CHT( { loadTemplates: loadTemplates } );
		return cht_instance;
	}

	function loadModule( sn ) {

		if( !(sn instanceof SplitName) ) sn = splitModuleName( sn );

		var	text = sn.sourceText(),
			nls  = sn.nlsBundle();

		return d.when(
			text,
			function( txt ) {
				return {
					url: sn.url(),
					src: txt,
					nls: nls
				};
			}
		);
	}

	function parseModule( loaded, cached ) {
		if( !cached.nls )	cached.nls = loaded.nls;
		else	mergeNlsBundles( cached.nls, loaded.nls );
		return chtInstance().parse( loaded.src, cached.parsed, loaded.url );
	}

	function loadAndParseModule( mdl_or_sn ) {
		var mdl = mdl_or_sn instanceof SplitName ? mdl_or_sn.namespace() : mdl_or_sn;
		if( cache[mdl] )	return cached[mdl];
		else return cache[mdl] = d.when( 
			loadModule( mdl_or_sn ), 
			function( loaded ) {
				var cached = { parsed: {}, compiled: {} };
				return d.when( 
					parseModule( loaded, cached ),
					function() { return cache[mdl] = cached; }
				)
			}
		);
	}

	function loadAndParseModuleList( mdl_list ) {
		// Note that loadModule() loads NLS resources synchronously so this sequence is suboptimal
		var root = mdl_list[0],
			all = d.map( mdl_list.reverse(), loadModule ),
			cached = { parsed: {}, compiled: {} };

		function parseNext( loaded ) {
			return d.when(
				parseModule( loaded, cached ),
				function() {
					return all.length ?
						d.when( all.shift(), parseNext ) :
						cached;
				}
			);
		}

		return cache[root] = d.when(
			d.when( all.shift(), parseNext ),
			function( cached ) { return cache[root] = cached; }
		);
	}

	function resolveTemplatesLater( refs, mdl, tpls ) {
		return function( cached ) {
			d.forEach( tpls, function( tpl ) {
				if( !(tpl in cached.parsed) )
					throw Error( '<?' + tpl + '?> is not defined in ' + mdl );
				refs[mdl + '.' + tpl] = cached.parsed[tpl];
			} );
			return false; // Prevent propagation of a deferred
		}
	}

	function loadTemplates( refs ) {

		var namespaces = {}, deferred = new WaitingList();

		for( var tpl in refs ) {
			var sn = splitTemplateName( tpl );
			if( !(sn.namespace() in namespaces) )
				namespaces[sn.namespace()] = [];
			namespaces[sn.namespace()].push( sn.templateName );
		}
		
		for( var ns in namespaces )
			deferred.push( d.when(
				cache[ns] || loadAndParseModule( ns ),
				resolveTemplatesLater( refs, ns, namespaces[ns] )
			) );

		return d.when( deferred, function() { return refs; } );
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

		var deferredTemplateInstance = d.extend( 
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
			var result = new WaitingList();

			for( var i=0; i<arguments.length; ++i ) {
				var	mdl_list = arguments[i].split( /\s*\+\s*/ );
				result.push(
					cache[ mdl_list[0] ] || 
					( cache[mdl_list[0]] = loadAndParseModuleList( mdl_list ) )
				);
			}

			return result;
		},

		get: function( tpl ) {
			var sn = splitTemplateName( tpl ),
				cached = cache[ sn.namespace() ] || loadAndParseModule( sn );
			return cached.then ? deferGetTemplate( cached, sn ) : getTemplate( sn );
		}
	};
})();
