// Copyright (C) 2013 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "adstream.views.list.Selection" );

dojo.require( "adstream.views._base" );
dojo.require( "dijit._WidgetBase" );

(function(d){

var selectionOpsMap = {
	on: "op", off: "op", toggle: "op"
};

function mapSelectionOps( args, n ) {

	args = d.map( 
		Array.prototype.slice.call( args, n ), 
		function(arg) {
			return arg === true ? "on"
				 : arg === false ? "off"
				 : arg && arg.toString() || "";
		}
	).join( " " );

	var result = { op: "on" };

	args.replace( /\w+/g, function( arg ) {
		if( arg in selectionOpsMap )
			result[ selectionOpsMap[arg] ] = arg;
		else
			result[arg] = true;
		return "";
	}

	return result;
}

function applySelection( ops, item ) {
	var	op = { on: true, off: false }[ops.op],
		prev = d.toggleClass( item, 'av-selected-item', op );
	return typeof op === 'undefined' ? !prev && item : op !== prev ? op && item : undefined;
}

function isDefined( item ) { 
	return typeof item !== 'undefined'; 
}

function isNotFalse( item ) {
	return item;
}

dojo.declare( 'adstream.views.list.Selection', [dijit._WidgetBase,adstream.views.EventEmitter], {

	mapSelected: null,

	selectedItems: function() {
		return d.query( '.av-selected-item', this.domNode );
	},

	selectItem: function( item /*, ... */ ) {
		var ops = mapSelectionOps( arguments, 1 ),
			selected = applySelection( ops, item );

		if( selected && !ops.multi ) {
			this.selectedItems().removeClass( 'av-selected-item' );
			d.toggleClass( item, 'av-selected-item', true );
		}
		
		if( typeof selected !== 'undefined' )
			this.emitSelectionChange( selected && item );
	},
	
	selectItemRange: function( from, to /*, ... */ ) {
		var ops = mapSelectionOps( arguments, 2 ),
			prior_selected = this.selectedItems(),
			items = d.query( '.av-item', this.domNode );
		
		from = d.indexOf( items, from );
		to = d.indexOf( items, to );

		if( from<0 || to<0 )
			throw Error( "Attempt to select a non-item" );

		var newly_selected = 
			items.slice( from, to+1 ), d.hitch( null, applySelection, ops ) )
				 .map( isDefined );

		if( ops.exclusive && newly_selected.some( isNotFalse ) ) {

			newly_selected = newly_selected.filter( isNotFalse );
			// FIXME: O(N*M) complexity
			prior_selected.filter( function( item ){ 
				return newly_selected.indexOf( item ) < 0;
			} )
				.removeClass( 'av-selected-item' );

			this.emitSelectionChange( newly_selected );

		} else if( newly_selected.length > 0 )
			// FIXME: O(N*M) complexity
			this.emitSelectionChange( 
				items.slice( 0, from ).filter( wasSelected )
					 .concat( newly_selected.filter( isNotFalse ) )
					 .concat( items.slice( to+1 ).filter( wasSelected ) )
			);

		function wasSelected( item ) {
			return prior_selected.indexOf( item ) >= 0;
		}
	},

	emitSelectionChange: function( item_or_items ) {
		if( this.mapSelected )
			this.emitEvent( "selectionChanged", { selection:
				item_or_items 
					? item_or_items.map && item_or_items.map( this.mapSelected ) || [ this.mapSelected( item_or_items ) ]
					: []
			} );
	}
} );

})(dojo);

