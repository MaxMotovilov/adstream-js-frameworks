// Copyright (C) 2010-2012 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( 'adstream.data.schema' );

(function() {

var d = dojo,
	ad = adstream.data,
	ads = adstream.data.schema;

function mix( to, from ) {
	for( var i in from )
		if( from.hasOwnProperty(i) )
			to[i] = from[i];
	return to;
}

ad._splitURL = function( url ) {
	return /^(.*)\/([^\/]*)$/.exec( url ) || [ url, url, '' ];
}

ad._descend = function( rel_url, obj, step ) {
	step = step || _byInstance;

	var	last = null;	
	
	return {
		rel_url: rel_url.replace( /([^\/]*)(?:\/|$)/g, function(ctx,path_item) {
			if( ctx && obj ) {
				last = obj;
				obj = step( obj, path_item );
			}
			return obj ? '' : ctx;
		} ),
		obj: obj || last
	};
}

function _byInstance( obj, path_item ) {
	var	ret;
	return obj.hasOwnProperty(path_item) && 
		   (ret = obj[path_item]) instanceof ads.Node &&
		   ret;
}

ads._byAutoInstantiatedSchema = function( obj, path_item ) {
	var p;

	if( p = _byInstance( obj, path_item ) )	
		return p;

	if( (p = obj._schemaProp( path_item )) && p instanceof ads.Node )
		return obj[path_item] = p._new( obj._service, obj._composeURL( path_item ) );

	return null;
}

var	_unique_id = 0;
function _uniqueID() { return ++_unique_id; }

function _identical( a, b, ignore_schema_objects ) 
{

	if( typeof a === 'undefined' || typeof b === 'undefined' )
		return typeof a === typeof b;

	if( typeof a !== 'object' && typeof b !== 'object' )
		return a.toString() == b.toString();
	else if( typeof a !== typeof b )
		return false;
	else if( a === null || b === null )
		return a === null && b === null;

	for( var i in a )
		if( a.hasOwnProperty(i) && i != '_' && !_identical( a[i], b[i] ) )
			return false;

	for( var i in b )
		if( i != '_' && b.hasOwnProperty(i) && 
			!(ignore_schema_objects && b[i] instanceof ads.Node) && 
			!(i in a) )	
				return false;

	return true;	
}

function _mixIfNotPresent( dst, src ) 
{
	for( var i in src ) {
		if( i in src && i in dst && !_identical( src[i], dst[i] ) )
			return false;
		dst[i] = src[i];
	}
	return true;
}

function _bySchema( obj, path_item ) 
{
	var ret = obj._schemaProp( path_item );
	return ret && (ret instanceof ads.Node) && ret;
}

ad._descendSchema = function( rel_url, obj )
{
	var p = ad._descend( rel_url, obj, _bySchema );
	if( p.rel_url )	throw Error( obj._.url + '/' + rel_url + ' does not specify an object in the schema' );
	return p.obj;
}

function _identicalProp( src, dst )
{
	if( !src ) { // null == default settings
		for( var i in dst )
			if( dst.hasOwnProperty( i ) )
				return false;
		return true;
	}

	for( var i in src )
		if( src[i] === null ? dst.hasOwnProperty( i ) : src[i] != dst[i] )
			return false;

	for( var i in dst )
		if( !( i in src ) )	return false;

	return true;
}

function _copyProp( src, dst )
{
	for( var i in dst )
		if( dst.hasOwnProperty( i ) )
			delete dst[i];

	for( var i in src )
		if( src[i] !== null )
			dst[i] = src[i];
}

function _hasProps( o ) {
	for( var i in o )
		if( i != '_' ) return true;
	return false;
}

d.declare( 'adstream.data.schema.Node', null, {

	constructor: function( sub, options, proto ) {
		this._subschema = sub || {};
		this._ = {};

		if( options ) for( var i in options )
			this['_'+i] = options[i];

		if( proto ) for( var i in proto )
			if( !( i in this ) )	
				this[i] = proto[i];

		for( var i in this._subschema ) {
			if( this._subschema[i] instanceof ads.Method )
				this[i] = this._subschema[i].body;
		}
	},

	_new: function( svc, url ) {

		if( !this.hasOwnProperty( '_subschema' ) )
			throw Error( "_new() called on an instance instead of the schema object" );

		var	impl = d.delegate( this, {
				_: 			d.delegate( this._, { url: url } ),
				_service: 	svc,
				
				_fork: function( props, proto, meta ) {
					if( meta ) {
						meta = d.delegate( this._, meta );
						if( proto )
							proto._ = meta;
						else
							proto = { _: meta };
					}
					
					if( proto )	proto = d.delegate( impl, proto );
					else		proto = impl;
					
					return d.delegate( proto, props );
				},

				_override: function( name, mtd ) {
					var	old = this[name];
					if( mtd )	
						impl[name] = mtd;
					else if( impl.hasOwnProperty(name) )
						delete impl[name];
					return old;
				}
			} ),
			obj = impl._fork();

		if( !(this instanceof ads.Container) && this._subschema )
			for( var i in this._subschema )
				if( !(this._subschema[i] instanceof ads.Object) ) {
					obj[i] = this._subschema[i]._new( svc, obj._composeURL( i ) );
					obj[i]._.partial = true;
				}

		return obj;
	},

	_instantiateSchema: function() {
		for( var i in this._subschema )
			if( this._subschema[i] instanceof ads.Node ) {
				this[i] = this._subschema[i]._new( this._service, this._composeURL( i ) );
				this[i]._instantiateSchema();
			}
	},

	_composeURL: function( rel_url ) {
		return rel_url ? this._.url ? this._.url + '/' + rel_url : rel_url : this._.url;
	},

	_schemaProp: function( path_item ) {
		return this._subschema[path_item] || null;
	},

	_wrap: function( data ) {
		if( !data )	throw Error( "Attempt to save a read-only or unmodified object " + this._.url );
		var result = {};
		result[this._.url] = data;
		return result;
	},

	_marshal: function( depth ) {

		var	result = null;

		if( depth ) {
			var to = {}, item;
			for( var i in this )
				if( this.hasOwnProperty(i) &&
					this[i] instanceof ads.Node &&
					(item = this[i]._marshal( depth-1 )) ) {
					to[i] = item;
					result = to;
				}
		}

		return result;
	},

	_unmarshal: function( data ) { return false; },

	_copyProp: function( src, prop ) {
		if( this._.hasOwnProperty( prop ) )
			if( !src )	delete this._[prop];
			else		_copyProp( src, this._[prop] );
		else if( src )	this._[prop] = d.delegate( this._[prop], src );
	},

	_copyPropsIfChanged: function( src, props, forkme ) {
		var	meta, _this = this;

		if( src._ )	d.forEach( props, function(prop) {
			
			if( !( prop in src._ ) )	return;

			if( typeof src._[prop] === 'object' ) {
				if( typeof this._[prop] !== 'object' )
					throw Error( prop + " is not a valid structured metadata property for " + this._.url );
				
				if( this._.hasOwnProperty( prop ) ?
						!src._[prop] || !_identicalProp( src._[prop], this._[prop] ) :
						src._[prop]
				) {
					modified();
					this._copyProp( src._[prop], prop );
				}
			} else if( typeof this._[prop] === 'object' ) 
				throw Error( prop + " is not a valid scalar metadata property for " + this._.url );
			else if( src._[prop] != this._[prop] ) {
				modified();
				this._[prop] = src._[prop];
			}

			if( this._.hasOwnProperty( '_'+prop ) )
				delete this._['_'+prop]; // Clobber the shadow copy
		}, this );

		return meta;
		
		function modified() {
			if( !meta )
				meta = !forkme || mix( {}, _this._ );
		}
	},

	_isInstance: function() {
		return !this.hasOwnProperty( '_' );
	},

	_notYetCreated: function() {
		return /(?:\/|^)@/.test( this._.url );
	},

	_URL_Params: function( depth, init ) { 
		var result = init || {};
		if( depth )
			for( var sp in this._subschema )
				(this[sp] || this._subschema[sp])._URL_Params( depth-1, result );

		return result;
	},

	_URL_Version: function() {},

	_parentNode: function() {
		var split_url = ad._splitURL( this._.url ),
			p = ad._descend( split_url[1], this._service.root );

		if( p.rel_url )	
			throw Error( "Object at " + this._.url + " is not connected to schema" );

		return p.obj;		
	},

	_saveIfNotCreated: function() {
		if( /@.*[\/]/.test( this._.url ) )
			throw Error( "Cannot save " + this._.url + " as its parent has not yet been saved" );

		var	parent = this._parentNode(),
			item = parent[ this.id() ];

		return d.when( 
			parent.save( this.id() ),
			// Should not return item as the response may have deleted it instead of updating!
			function( ctr ) { return ctr[ item.id() ]; }
		);
	},

	_itemDelete: function() {
		if( this._notYetCreated() || this._deleteViaParent )
			return this._parentNode().del( this.id() );
		else
			return this._service.DELETE( this._.url, this._URL_Version() );
	},

	_anyChild: function( depth ) {	//	Iterates over subschema which is likely faster
		if( depth > 0 )
			for( var i in this._subschema )
				if( this.hasOwnProperty( i ) && this[i] instanceof ads.Node && 
					this[i]._isPartial( depth-1 ) )
					return true;
		return false;
	},

	_isPartial: function( depth ) {
		return this._.partial || this._anyChild( depth );
	},

	url: function() { return this._.url; },

	id: function() { return /[^\/]+$/.exec( this._.url )[0]; },
	
	service: function() { return this._service; },

	get: function( rel_url, depth, force ) {
		var	p = ad._descend( rel_url||'', this );

		if( !force && !p.rel_url && !p.obj._isPartial( depth||p.obj._defaultGetDepth||0 ) )
			return p.obj;

		var	schema_obj = ad._descendSchema( p.rel_url, p.obj ),
			params = schema_obj._URL_Params( depth );

		if( (depth = depth||schema_obj._defaultGetDepth||0) >= 0 )
			params.depth = depth;

		return this._service.GET( this._composeURL( rel_url ), params );
	},

	// Retained for backward compatibility only, use watch() instead
	on_sync: function( cb, rel_url, max_depth, min_depth ) {

		if( typeof rel_url === 'number' ) {
			min_depth = max_depth || 0;
			max_depth = rel_url;
			rel_url = '';
		}

		var opt = {};
		if( max_depth )	opt.maxDepth = max_depth;
		if( min_depth )	opt.minDepth = min_depth;

		this.watch( cb, rel_url, opt );
	},

	watch: function( cb, rel_url, options ) {

		if( typeof rel_url === 'object' ) {
			options = rel_url;
			rel_url = '';
		}

		if( !options || !('maxDepth' in options) ) {
			var	p = ad._descend( rel_url||'', this ),
				ref_obj = p.rel_url ?
					ad._descendSchema( p.rel_url, p.obj ) :
					p.obj;
			if( '_defaultGetDepth' in ref_obj )
				(options||(options={})).maxDepth = ref_obj._defaultGetDepth;
		}

		return this._service.watch( cb, this._composeURL( rel_url ), options );
	},

	ignore: function( rel_url ) {
		return this._service.ignore( this._composeURL( rel_url ) );
	},

	save: function( depth ) {
		if( this._notYetCreated() )
			return this._saveIfNotCreated();
		return this._service.PUT( 
			this._.url, this._wrap( this._marshal( depth||0 ) ), 
			this._isItem && this._URL_Params( depth||0, this._parentNode()._URL_Params(0) )
		);
	}
} );

d.declare( 'adstream.data.schema.Object', [ ads.Node ], {

	_unmarshal: function( data, _, forkme ) {

		var meta, props, _this = this;

		if( this._.version && data._ && data._.version && data._.version < this._.version ) {
			if( dojo.config.isDebug )
				console.warn( "Discarding update to " + _this._url + " as current version " + 
							  this._.version + " is greater than the new version " + data._.version );
			return false;
		}

		var partial = data._ && data._.partial;
		if( partial && !_hasProps( data ) )
			delete data._.partial;

		if( !(meta = this._copyPropsIfChanged( data, [ 'version', 'partial' ], forkme )) &&
			_identical( data, this, true )
		)
			return false;

		if( !partial )
			for( var i in this )
				if( this.hasOwnProperty(i) && !(this[i] instanceof ads.Node) ) {
					modified();
					delete this[i];
				}

		for( var i in data )
			if( i != '_' ) {
				modified();
				this[i] = data[i];
			}

		return !forkme || this._fork( props, null, meta );

		function modified() {
			if( forkme && !props )
				props = mix( {}, _this );
		}
	},

	_marshal: function( depth ) {

		if( this._readOnly )	return null;
	
		var to = {}, item,
			meta = this._URL_Version();
		
		if( meta )	to._ = meta;

		for( var i in this ) {
			if( !this.hasOwnProperty(i) )	continue;
			if( !(this[i] instanceof ads.Node) )
				to[i] = this[i];
			else if( depth && (item = this[i]._marshal( depth-1 )) )
				to[i] = item;
		}
		
		return to;
	},

	_URL_Version: function() {
		if( 'version' in this._ )
			return { version: this._.version };
	}
} );

d.declare( 'adstream.data.schema.Container', [ ads.Node ], {

	constructor: function() {
	
		if( !this._subschema.item )	
			throw Error( "Container must have an 'item' slot in its subschema" );

		this._defaultSetting( 'filter' );
		this._defaultSetting( 'view' );
		this._defaultSetting( 'extra' );

		if( 'del' in this._subschema.item )	// Container in container
				this._subschema.item._itemDel = this._subschema.item._itemDelete;
		else	this._subschema.item.del = this._subschema.item._itemDelete;

		this._subschema.item._isItem = true;
	},

	_defaultGetDepth: 1,

	_defaultSetting: function( name ) {
		if( name in this._subschema ) {
			this._[name] = this._subschema[name];
			delete this._subschema[name];
		} else	this._[name] = {};
	},

	_instantiateSchema: function() {},

	_schemaProp: function( path_item ) {
		//	Assuming that any item ID except '_' is valid
		return path_item == '_' ? null : this._subschema.item;
	},

	_unmarshal: function( data, props, forkme ) {

		var	meta = this._copyPropsIfChanged( data, [ 'filter', 'view', 'extra' ], forkme ),
			saved_props, proto, created, deleted, _this = this;

		for( var i in props )
			if( !props[i] ) {
				if( this.hasOwnProperty(i) ) {
					modified( null, i );
					delete this[i];
				}
			} else if( props[i]._ && props[i]._.replaces &&
					   props[i]._.replaces in this ) {
				modified( i, props[i]._.replaces );
				this[i] = this[ props[i]._.replaces ]; // URL is now fixed by Service._sync()
				delete this[ props[i]._.replaces ];
			} else if( !(i in this) )
				modified( i );

		if( !(data._ && data._.partial) ) {
			for( var i in this )
				if( this.hasOwnProperty( i ) && !(i in props) && this[i] instanceof ads.Node ) {
					modified( null, i )
					delete this[i];
				}
			d.forEach( [ 'filter', 'view' ], function( prop ) {
				if( this._.hasOwnProperty( '_' + prop ) ) {
					// Do the work of the lazy server
					if( !_identicalProp( this._['_' + prop], this._[prop] ) && !meta )
						meta = !forkme || mix( {}, this._ );
					this._copyProp( this._['_' + prop], prop );
					delete this._['_' + prop];
				}
			}, this );
			if( this._.partial )	delete this._.partial;
		}

		if( !forkme )
			return meta || saved_props;
		else if( !( meta || saved_props ) )
			return false;
		else {
			if( created )
				(proto || (proto={})).created = created;
			if( deleted )
				(proto || (proto={})).deleted = deleted;
				
			return this._fork( saved_props, proto, meta );
		}
		
		function modified( ins, del ) {
			if( forkme ) {
				if( !saved_props )
					saved_props = mix( {}, _this );
				if( ins )
					( created || (created=[]) ).push( ins );
				if( del )
					( deleted || (deleted=[]) ).push( del );
			} else
				saved_props = true;
		}
	},

	_marshal: function( depth ) {

		if( this._readOnly )	return null;

		var result = null, to = {}, item;

		if( depth < 0 || 		// Called on self or parent container, so it is a POST
			this._saveWithParent// Called on parent object -- mix POST data into a PUT
		) 
			for( var i in this )
				if( this.hasOwnProperty(i) && 
					( this._saveAllItems || i.charAt(0)=='@' ) &&
					(item = this[i]._marshal( -1 )) ) {
					to[i] = item;
					result = to;
				}
		
		return result;		
	},

	_URL_Params: function( depth, init ) {

		var result = init || {}, _this = this;

		'filter,view'.replace( /\w+/g, function(m) {
			var from = _this._['_'+m] || _this._[m];
			for( var p in from ) {
				var v = from[p];
				if( v === null ) continue;
				if( p in result && (p = _this.id() + '.' + p) in result &&
					!_identical( v, result[p] ) 
				)
					throw Error( "URL parameter " + m + "." + p.replace(/.*\./,'') + " is in conflict at " + _this._.url );
				result[p] = v;
			}
		} );

		if( depth )
			for( var i in this ) 
				if( this.hasOwnProperty(i) && this[i] instanceof ads.Node )
					this[i]._URL_Params( depth-1, result );

		return result;
	},

	_isPartial: function( depth ) {
		return this._.partial || d.some( [ 'filter', 'view' ], function( prop ) {
			return this._.hasOwnProperty( '_'+prop ) && 
				   !_identicalProp( this._['_'+prop], this._[prop] );
		}, this ) || this._anyChild( depth );
	},

	_anyChild: function( depth ) { // Iterates over object's properties rather than subschema
		if( depth > 0 )
			for( var i in this )
				if( this.hasOwnProperty[i] && this[i] instanceof ads.Node &&
					this[i]._isPartial( depth-1 ) )
					return true;
		return false;
	},
				
	create: function() {

		if( this._readOnly )	throw Error( "Cannot create items in a read only container " + this._.url );

		var temp_id = '@' + _uniqueID(),
			result = this._subschema.item._new( this._service, this._composeURL( temp_id ) );
		result._instantiateSchema();
		return this[temp_id] = result;
	},

	_bulkOp: function( what, op ) {
		if( typeof what === 'function' ) {
			for( var i in this )
				if( this.hasOwnProperty(i) && this[i] instanceof ads.Node && what( this[i] ) )
					op.call( this, this[i] );
		} else if( what instanceof Array )
			for( var i=0; i<what.length; ++i )
				op.call( this, this[ what[i] ] );
		else op.call( this, this[what] );
	},

	del: function( what ) {

		if( !what ) {
			if( !(_itemDel in this) )	
				throw Error( "Container.del() should have a parameter if container is not an item itself" );
			return this._itemDel();
		}

		var	to_delete = [];
		this._bulkOp( what, function( item ) {
			if( item._notYetCreated() )
					delete this[item.id()];
			else	to_delete.push( item );
		} );

		if( to_delete.length == 0 )
			return null;
		else if( to_delete.length == 1 && !to_delete[0]._deleteViaParent /* minor optimization */ )
			return to_delete[0].del();

		// Batch delete

		var	packet = {};
		d.forEach( to_delete, function( item ) {
			var meta = item._URL_Version();
			packet[item.id()] = meta ? ( meta['delete'] = true, { _: meta } ) : null;
		} );

		return this._service.PUT( this._.url, this._wrap( packet ), this._URL_Params( 0 ) );
	},

	save: function( what, depth ) {
		
		if( !what ) {
			if( this._notYetCreated() )	return this._saveIfNotCreated();
			else	return this._service.POST( this._.url, this._wrap( this._marshal( -1 ) ), this._URL_Params( -1 ) );
		}

		if( this._notYetCreated() )
			throw Error( "Cannot save children of " + this._.url + " that has not been saved yet" );

		var to_save = []
		this._bulkOp( what, function( item ) { 
			to_save.push( item ); 
		} );

		if( to_save.length == 0 )
			return this;
		else if( to_save.length == 1 && !to_save[0]._notYetCreated() )
			return to_save[0].save( depth );

		// Batch save

		var packet = {}, any_modified = false;
		d.forEach( to_save, function( item ) {
			any_modified = any_modified || !item._notYetCreated();
			packet[item.id()] = item._marshal( item._notYetCreated() ? -1 : depth );
		} );

		return ( any_modified ? this._service.PUT : this._service.POST ).call( this._service, this._.url, this._wrap( packet ), this._URL_Params( -1 ) );
	},

	filter: function( new_filter ) {
		return this._vf_prop( 'filter', new_filter );
	},

	view: function( new_view ) {
		return this._vf_prop( 'view', new_view );
	},

	_vf_prop: function( prop, value ) {

		if( typeof value !== 'undefined' ) {

			var	defaults = ad._descendSchema( this._.url, this._service.root )._[prop];
			value = d.delegate( defaults, value || {} );
			for( var i in value )
				if( value.hasOwnProperty( i ) && value[i] === null )
					delete value[i];

			this._['_' + prop] = value;

		} else if( !this._.hasOwnProperty( '_' + prop ) ) {
			var	defaults = ad._descendSchema( this._.url, this._service.root )._[prop];
			this._['_' + prop] = d.delegate( defaults, this._.hasOwnProperty( prop ) ? mix( {}, this._[prop] ) : {} );
		}

		return this._['_' + prop];
	},

	extra: function() { return this._.extra; },

	refresh: function( depth ) {
		return this.get( '', depth, true );
	}
} );

var undefined;

d.declare( 'adstream.data.schema.Connector', ads.Node, {

	"-chains-": { constructor: "manual" },
	
	constructor: function() {
		this._subschema = {};
		this._ = {};
	},

	connect: function( node, rel_url ) {
		this._connect_to_svc = node.service();
		this._dest_url = node._composeURL( rel_url );
	},

	save:  undefined,
	get:   undefined,
	watch: undefined,
	ignore:undefined,

	_marshal: function() { 
		return null; 
	},

	_unmarshal: function( data ) {
		if( this._connect_to_svc ) {
			if( this._dest_url ) {
				var copy = {};
				for( var i in data )	
					copy[ this._dest_url + (this._dest_url && i && '/') + i ] = data[i];
				data = copy;
			}
			this._connect_to_svc.push( data, this._dest_url );
		}
		return false;
	}
} );

d.declare( 'adstream.data.schema.Method', null, {} );

})();

