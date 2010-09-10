dojo.provide( 'bsb' );

dojo.require( 'dijit.form.ComboBox' );
dojo.require( 'dojox.jtlc.CHT' );
dojo.require( 'adstream.data.Service' );

bsb.downloaded_templates = dojo.xhrGet( { url: 'books.cht' } ).then( 
	function(v){ return bsb.downloaded_templates = v; } 
);

bsb.templates = new dojo.Deferred();

function compileTemplates( input )
{
	bsb.cht = new dojox.jtlc.CHT(),
	bsb.compiled_templates = bsb.cht.parse( input );
	bsb.i18nDictionary = {};
	bsb.downloaded_templates = true;

	var promise = bsb.templates;
	promise.resolve( bsb.templates = {} );

	return true;
}

function getTemplate( name )
{
	return bsb.templates[name]||(
		bsb.templates[name] = dojox.jtlc.compile( bsb.compiled_templates[name], bsb.cht, { i18nDictionary: bsb.i18nDictionary } )
	);
}

dojo.ready( function() {

	var ads = adstream.data.schema;

	bsb.root = adstream.data.connect( '/', 
		new ads.Node( {
			books: new ads.Container( {
				item: new ads.Object(),
				view: { offset:0, count: 30 }
			} ),
			authors: new ads.Container( {
				item: new ads.Object(),
				view: { offset:0 }
			} )
		} )
	);

	dojo.when(
		dojo.when( bsb.downloaded_templates, compileTemplates ),
		dojo.hitch( bsb.topControls, bsb.topControls.connectData )
	);
} );

dojo.declare( 'bsb.TopControls', null, {
	
	constructor: function( bag, elt ) {
		dojo.mixin( this, bag );

		bsb.topControls = this;

		dojo.mixin( this, {
			element:		elt,
			displayOffset: 	0,
			lastViewOffset: 0,
			searching:		false,
			searchPending:  null
		} );

		var _this = this;
		dojo.when( bsb.templates, function() {
			dojo.place( getTemplate( 'TopControls' )().toDom(), elt );
			dojo.query( '.tab', elt ).forEach( function(tab){
				dojo.connect( tab, 'onclick', _this, _this.onclick );
			} );
			dojo.connect( dojo.byId('searchBox'), 'onkeyup', _this, _this.onSearchKeyUp );
		} );
	},

	data: null,
	selectedAuthor: null,

	contentTemplates: { authors: 'AuthorList', books: 'BookList' },

	connectData: function() {
		bsb.root.on_sync( dojo.hitch( this, this.refresh, 'books' ), 'books' );
		bsb.root.on_sync( dojo.hitch( this, this.refresh, 'authors' ), 'authors' );
		bsb.topControls.selectTab( 'books' );
	},

	onclick: function(e) {
		this.selectTab( dojo.attr( e.target, 'name' ) );
		dojo.stopEvent(e);
	},

	selectTab: function( name ) {
		if( this.selectedTab != name ) {
			this.selectedTab = name;

			dojo.query( '.tab', this.element ).forEach( function(tab){
				if( dojo.attr( tab, 'name' ) == name )	dojo.addClass( tab, 'selected' );
				else									dojo.removeClass( tab, 'selected' );
			} );

			this.displayOffset = 0;
			this.lastViewOffset = 0;

			bsb.root.get( name );
		}
	},
	
	refresh: function( name, data ) {
		if( name != this.selectedTab )	return;

		this.searching = false;

		if( data.view().offset != this.lastViewOffset )	{
			this.displayOffset = 0;
			this.lastViewOffset = data.view().offset;
		} else if( 'lastVisible' in this )	delete this.lastVisible;

		dojo.place( getTemplate( this.contentTemplates[name] )( data, this ).toParsedDom(), 'list', 'only' );

		var list = dojo.byId( 'list' ),
			tbl = dojo.query( 'table', list )[0],
			box = dojo.contentBox( list );

		this.displayCount = 0;

		if( 'lastVisible' in this )	{
			this.lastVisible -= this.lastViewOffset;
			this.trimBackward( tbl, box, name=='books' ? 1:0 );
		}

		this.trimForward( tbl, box, name=='books' ? 1:0 );

		this.attachPageControls( dojo.byId( 'list' ) );
	},

	trimForward: function( tbl, box, skip ) {
		for( var i = skip; i<tbl.rows.length; ++i, ++this.displayCount ) {
			var b = dojo.marginBox( tbl.rows[i] );
			if( b.t + b.h > box.t + box.h )	break;
		}

		while( tbl.rows.length > i )
			tbl.deleteRow( tbl.rows.length - 1 );
	},

	trimBackward: function( tbl, box, skip ) {
		var last;
		while( tbl.rows.length-1-skip >= this.lastVisible - this.displayOffset ) {
			var b = dojo.marginBox( tbl.rows[this.lastVisible - this.displayOffset + skip] );
			if( b.t + b.h > box.t + box.h )	{
				++this.displayOffset;
				tbl.deleteRow( skip );
			} else break;
		}

		delete this.lastVisible;
	},

	prevPage: function(e) {
		var data = bsb.root[ this.selectedTab ],
			offs = data.view().offset,
			move_total = Math.min( offs + this.displayOffset, 30 /* Big enough to fill the page */ ),
			move_now = Math.min( this.displayOffset, move_total );

		this.displayOffset -= move_now;
		move_total -= move_now;

		if( move_total ) {
			data.view( { offset: offs - move_total, count: null } );
			this.lastVisible = offs-1;
			data.get();
		}

		if( move_now )	this.refresh( this.selectedTab, data );

		dojo.stopEvent( e );
	},

	nextPage: function(e) {
		var data = bsb.root[ this.selectedTab ];
		this.displayOffset += this.displayCount;
		this.refresh( this.selectedTab, data );

		data.view( { offset: data.view().offset + this.displayOffset, count: null } );

		data.get();
		dojo.stopEvent( e );
	},

	attachPageControls: function( elt ) {
		var view = bsb.root[this.selectedTab].view();
		dojo.query( 'img[command]', elt ).forEach( function(e) {
			var	cmd = dojo.attr( e, 'command' );
			dojo.connect( e, 'onclick', this, cmd );
			if( cmd == 'prevPage' && this.displayOffset + view.offset > 0 ||
				cmd =='nextPage' && this.displayOffset + this.displayCount < view.count )
				e.style.display = 'block';
		}, this );
	},

	onSearchKeyUp: function() {
		if( this.searchPending )	dojo.global.clearTimeout( this.searchPending );
		this.searchPending = dojo.global.setTimeout( dojo.hitch( this, this.search ), this.searching ? 500 : 200 );
	},

	search: function() {	
		this.searchPending = null;
		var	data = bsb.root[this.selectedTab],
			srch = dojo.byId( 'searchBox' ).value;
		if( data.filter() && data.filter().search == srch )	return;

		data.filter( srch ? { search: srch } : null );
		data.view( { offset: 0, count: null } );

		data.get();
	}
} );

dojo.declare( 'bsb.InplaceEditField', null, {

	constructor: function( bag, elt ) {
		dojo.mixin( this, bag );
		this.onclick_cookie = [	dojo.connect( elt, 'onclick', this, this.onclick ) ];
		var img = dojo.query( 'img', elt )[0];
		if( img )	this.onclick_cookie.push( dojo.connect( img, 'onclick', this, this.deleteMe ) );
	},

	data: null,
	editTemplate: '',
	displayTemplate: '',
	field: '',

	onclose: function(){},

	onclick: function(e) {
		dojo.forEach( this.onclick_cookie, dojo.disconnect );
		dojo.place( getTemplate( this.editTemplate )( this.data, e.target ).toParsedDom(), e.target, 'before' );
		e.target.style.visibility = 'hidden';
		this.editor = e.target.previousSibling;
		dojo.forEach( [ 'onchange', 'onblur', 'onfocus' ],
			function(evt) {
				dojo.connect( this.editor, evt, this, evt );
			}, this
		);
		this.editor.focus();
		dojo.stopEvent(e);
	},

	onchange: function( event ) {
		this.data[this.field] = event.target.value;
	},

	onfocus: function( event ) {
		if( this.closingTimer ) {
			dojo.global.clearTimeout( this.closingTimer );
			delete this.closingTimer;
		}
	},

	onblur: function( event ) {
		this.closingTimer = dojo.global.setTimeout( dojo.hitch( this, 'closeEditor' ), 0 );
	},

	closeEditor: function() {
		this.data.save();
		this.onclose();
		dojo.place( getTemplate( this.displayTemplate )( this.data ).toParsedDom(), this.editor.parentNode, 'only' );
	},

	deleteMe: function(e) {
		if( confirm( dojo.attr( e.target, 'prompt' ) ) ) {
			this.data.del();
			
		}
		dojo.stopEvent(e);
	}
} );

dojo.declare( 'bsb.NewBookPane', null, {

	constructor: function( bag, elt ) {
		dojo.mixin( this, bag );
		this.onclick_cookie = dojo.connect( elt, 'onclick', this, this.onclickInit );
		this.element = elt;
	},

	onclickInit: function(e) {
		dojo.disconnect( this.onclick_cookie );
		dojo.when( bsb.root.get( 'authors' ), dojo.hitch( this, this.openEditor ) );
		dojo.stopEvent(e);
	},

	onclickDone: function(e) {
		dojo.forEach( this.onclick_cookie, dojo.disconnect );

		function nonempty(i) { return i }

		if( dojo.attr( e.target, 'name' )=='OK' ) {
			book = bsb.root.books.create();
			book.title = dojo.query('textarea',this.element)[0].value;
			book.authors = dojo.map(
				dojo.filter( this.authors, nonempty ),
				function( full_name ) {
					full_name = dojo.filter( full_name.split( /\s+/ ), nonempty );
					return { 
						lastName: full_name.length < 2 ? full_name[0] : full_name.slice( 1 ).join( ' ' ),
						firstName: full_name.length < 2 ? '' : full_name[0]
					};
				}
			);

			book.save();
		}
		
		dojo.place( getTemplate( 'NewBookPlaceholder' )( bsb.books, bsb.topControls ).toDom(), this.element, 'only' );
		bsb.topControls.attachPageControls( this.element );
		this.onclick_cookie = dojo.connect( this.element, 'onclick', this, this.onclickInit );
		dojo.stopEvent( e );
	},

	openEditor: function(authors) {
		this.authors = [];
		dojo.place( getTemplate( 'NewBookPane' )( authors, this ).toParsedDom(), this.element, 'only' );
		this.onclick_cookie = dojo.query( 'button', this.element ).map( function(elt) {		
			return dojo.connect( elt, 'onclick', this, this.onclickDone );
		}, this );
	},

	onAuthorChanged: function( widget, index ) {
		if( !widget.value && index != this.authors.length ) {
			widget.domNode.parentNode.removeChild( widget.domNode );
		} else if( widget.value && index == this.authors.length ) {
			this.authors.push( widget.value );
			dojo.place( getTemplate( 'AuthorSelect' )( bsb.root.authors, this ).toParsedDom(), widget.domNode, 'after' );
		} else this.authors[index] = widget.value;
	}
} );

