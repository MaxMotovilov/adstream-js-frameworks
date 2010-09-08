dojo.require( 'dojox.jtlc.JXL' );

function toHTML( text )
{
	return text.replace( /[&<>]/g, function( s ) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ s ];
	 	} ).replace( /(?:^|\n)[ \t]*/g, function( s ) {
			return s.replace( '\n', '<br>' ).replace( /[ \t]/g, '&nbsp;' );
		} );
}

function setText( div, title, text, more )
{
	div.innerHTML =
		'<div>' + title + '</div>' +
		toHTML( text ) +
		( more ? '<hr>' + toHTML(more) : '' );
}

function example( id, input, tpl_source, more )
{
	var	t = dojox.jtlc.tags,
		jxl = new dojox.jtlc.JXL();

	if( more )	eval( more );

	var tpl_s = eval( '1&&' + tpl_source ),
		tpl = dojox.jtlc.compile( tpl_s, jxl ),
		out = tpl( input ),
		panels = dojo.byId(id).children;
	
	setText( panels[0], 'Input', dojo.toJson( input, true ) );
	setText( panels[1], 'Template', tpl_source, more );
	setText( panels[2], 'Output', dojo.toJson( out, true ) );
}

dojo.ready( function() {
	for( var i in examples )
		example( i, examples[i].input, examples[i].template, examples[i].more );
} );

var	examples = {

Grouping_example_1: {

	input: [ 
		{ title: 'Alice in Wonderland', author: 'Lewis Carroll' },
		{ title: 'The Hunting of the Snark', author: 'Lewis Carroll' },
		{ title: 'The C++ Programming Language', author: 'Bjarne Straustrup' }
	],
		
	template: 
		'[ t.group(\n' +
		'   "author",\n' + 
		'   {\n' +
		'      author: "$[0].author",\n' +
	    '      titles: [ t.expr( "title" ) ]\n' +
	    '   },\n' +
		'   "[/author]"\n' +
		') ]'
},

Grouping_example_2: {

	input: [
		{ city: 'Dallas', country: 'USA', continent: 'North America' },
		{ city: 'London', country: 'UK', continent: 'Europe' },
		{ city: 'Kyiv', country: 'Ukraine', continent: 'Europe' },
		{ city: 'New York', country: 'USA', continent: 'North America' },
		{ city: 'Melbourne', country: 'Australia', continent: 'Australia' }
	],

	template:
		'[ t.group(\n' +
		'  "continent",\n' +
		'  {\n' +
		'    continent: "$[0].continent",\n' +
		'    countries: [\n' +
		'      t.group(\n' +
		'        "country",\n' +
		'        {\n' +
		'          country: "$[0].country",\n' +
		'          cities: [ t.expr( "city" ) ]\n' +
		'        }\n' +
		'      )\n' +
		'    ]\n' +
		'  },\n' +
		'  "[/continent,/country]"\n' +
		') ]'
},

Aggregation_example_1: {

	input: [
		{ item: 'Beer', price: 1.0 },
		{ item: 'Pizza', price: 5.0 },
		{ item: 'Porsche', price: 100000.0 }
	],

	template:
		't.last( t.expr(\n' +
		'  "{total:$1+=$.price," +\n' +
		'  "max_price:" +\n' +
		'    "$2=$2<$.price?$.price:$2}",\n' +
		'  t.current(),\n' +
		'  t.acc(0),\n' +
		'  t.acc("$[0].price")\n' +
		') )'
},

Aggregation_example_2: {

	input: [
		{ item: 'Beer', price: 1.0 },
		{ item: 'Pizza', price: 5.0 },
		{ item: 'Porsche', price: 100000.0 }
	],

	template:
		't.last( t.each( {\n' +
		'  total: t.bind(sum(0),"price"),\n' +
		'  max_price: t.bind(max(0),"price")\n' +
		'} ) )',

	more:
		'function sum( acc ) {\n' +
		'  return function( v ) {\n' +
		'    return acc += v;\n' +
		'  }\n' +
		'}\n' +
		'function max( acc ) {\n' +
		'  return function( v ) {\n' +
		'    return acc =\n' +
		'      Math.max( acc, v );\n' +
		'  }\n' +
		'}'
},

Flattening_example_1: {
	
	input: [ 
		{
		  "author": "Bjarne Straustrup",
		  "titles": [
			"The C++ Programming Language"
		  ]
		},
		{
		  "author": "Lewis Carroll",
		  "titles": [
			"Alice in Wonderland",
			"The Hunting of the Snark"
		  ]
		}
	],

	template: 
		'[ t.each(\n' +
		'    t.expr(\n' +
		'      "{author:$1,title:$}",\n' +
		'      t.from("titles"),\n' +
		'      "author"\n' +
		'    )\n' +
		') ]'
},

Flattening_example_2: {

	input: [
	 {
	  "continent": "Australia",
	  "countries": [
	   {
		"country": "Australia",
		"cities": [
		 "Melbourne"
		]
	   }
	  ]
	 },
	 {
	  "continent": "Europe",
	  "countries": [
	   {
		"country": "UK",
		"cities": [
		 "London"
		]
	   },
	   {
		"country": "Ukraine",
		"cities": [
		 "Kyiv"
		]
	   }
	  ]
	 },
	 {
	  "continent": "North America",
	  "countries": [
	   {
		"country": "USA",
		"cities": [
		 "Dallas",
		 "New York"
		]
	   }
	  ]
	 }
	],

	template:
		'[ t.each(\n' +
		'    t.expr(\n' +
		'      "{continent:$1.continent," +\n' +
		'       "country:$1.country," +\n' +
		'       "city:$}",\n' +
		'      t.from("cities"),\n' +
		'      t.current()\n' +
		'    ),\n' +
		'    t.expr(\n' +
		'      "{continent:$1," +\n' +
		'       "country:$.country," +\n' +
		'       "cities:$.cities}",\n' +
		'       t.from("countries"),\n' +
		'       "continent"\n' +
		'    ),\n' +
		'    t.current()\n' +
		') ]'
},

Dictionary_example_1: {

	input:
		{ firstName: "John",
		  lastName: "Smith",
		  occupation: "Software engineer"
	},

	template:
		'{\n' +
		'  _: t.many(\n' +
		'       t.expr(\n' +
		'         "{name:$,value:$1[$]}",\n' +
		'         t.setkey( "$", t.keys() ),\n' +
		'         t.current()\n' +
		'       )\n' +
		'     )\n' +
		'}'
},

Join_example_1: {

	input:
		{
		  countries: [
			{ country: "Australia", continent: "Australia" },
			{ country: "USA", continent: "North America" },
			{ country: "UK", continent: "Europe" },
			{ country: "Ukraine", continent: "Europe" }
		  ],
		  cities: [
			{ city: "Dallas", country: "USA" },
			{ city: "London", country: "UK" },
			{ city: "New York", country: "USA" },
			{ city: "Kyiv", country: "Ukraine" },
			{ city: "Melbourne", country: "Australia" }
		  ]
		},

	template:
		'[ t.expr(\n' +
		'    "{city:$.city," +\n' +
		'     "country:$.country," +\n' +
		'     "continent:$1[$.country]}",\n' +
		'    t.from("cities"),\n' +
		'    {\n' +
		'      _: t.many(\n' +
		'           t.expr(\n' +
		'             "continent",\n' +
		'             t.setkey(\n' +
		'               "country",\n' +
		'               t.from("countries")\n' +
		'             )\n' +
		'           )\n' +
		'         )\n' +
		'    }\n' +
		') ]'
}

};


