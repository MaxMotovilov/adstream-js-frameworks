**form** example
================

A barebones form with two text fields and **OK** button. Showcases the form infrastructure, composite elements/views,
control-level and form-level validation.

Files:

* `form.html`: the Web page infrastructure -- loads Dojo and the main module; mostly irrelevant to the example.
* `form.js`: minimal code required to display the form as part of the Web page and process the **OK** (submit) event. Note that
data edited by the form are stored in `form.dataObject`. All Javascript modules have to be `dojo.require`d as there currently
is no way to specify `.js` dependencies from CHT code.
* `CHT/form.cht`: form definition in CHT. All CHT dependencies are resolved automatically using the qualified template
names. Illustrates the API as it would be used by the application code.
* `mockup.js` and `CHT/mockup.js`: two minimalistic control mockups used in the form. Normally, full-blown library components
would be used in their stead; those have not yet been created and the highly schematic implementations are filling the gaps.

Libraries:

* `adstream.views`: proof of concept for the markup-based widget facility
* `dojox.jtlc`: CHT compiler and infrastructure



