`adstream.views`
================

Prototype/proof of concept for a library of interactive components (widgets, controls) with a markup-based declarative API.

Modules:

* `_base.js`: base class for scope objects used by the composite widget facility and helper functions.
* `CHT/composite.cht`: composite widget facility -- builds a single widget from multiple controller mix-ins, manages scope
objects shared between template and controller code, automates repeated rendering of widget content via its `View` template.
* `form.js', `CHT/form.cht`: the form infrastructure -- supports automatic creation of backup copy for the target data 
object, manages form-level validation.
* `pushButton.js`, `CHT/pushButton.cht`: the simplest possible control; still supports declarative mix-ins.
* `change.js`, `CHT/change.cht`: mix-ins for updating the view based on changes in the form data propagated by other controls.
* `validate.js`, `CHT/validate.js`: validator mix-ins that can be used with any control tied to its data object using the slot abstraction.
* `watch.js`, `CHT/watch.js`: set watchers on `adstream.data` sources from CHT code and update views automatically. As yet untested.
