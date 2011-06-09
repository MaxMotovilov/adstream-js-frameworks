hostenvType = "rhino";

dependencies = {

	layers: [
		{
			name: "dojo.js",
			dependencies: [	"main.collect" ]
		}
	],

	prefixes: [
		[ "main", "../../jtlc/i18n" ],
		[ "dojo", "../../../dojo-release-1.6.1-src/dojo" ],
		[ "dojox", "../dojox" ],
		[ "dijit", "../dijit" ],
		[ "dojox.jtlc", "../../jtlc/js/jtlc" ]
	]
};

