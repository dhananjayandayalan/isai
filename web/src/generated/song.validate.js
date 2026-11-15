/* eslint-disable */
/* Generated from schema/song.schema.json by `pnpm gen:types`. Do not edit by hand. */
import { fullFormats } from "ajv-formats/dist/formats";
const ucs2length = function ucs2length(str) {
    const len = str.length;
    let length = 0;
    let pos = 0;
    let value;
    while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 0xd800 && value <= 0xdbff && pos < len) {
            // high surrogate, and there is a next character
            value = str.charCodeAt(pos);
            if ((value & 0xfc00) === 0xdc00)
                pos++; // low surrogate
        }
    }
    return length;
};
export const validate = validate20;
export default validate20;
const schema31 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://isai.local/schema/song.schema.json","title":"Song","description":"One analysed song: tempo, tonality, chords and a playable two-hand arrangement. Contract between pipeline and web (ADR 0002).","type":"object","additionalProperties":false,"required":["schemaVersion","id","title","sourceType","durationSec","tempo","timeSignature","tonality","chords","notes","meta"],"properties":{"schemaVersion":{"description":"Version of this schema the file was written against. Every supported version is listed, newest last; the pipeline writes the newest (ADR 0008).","enum":["0.1.0","0.2.0","0.3.0"]},"id":{"description":"Stable identifier of the song analysis.","type":"string","minLength":1},"title":{"type":"string","minLength":1},"sourceType":{"description":"Which pipeline path produced the song.","type":"string","enum":["piano-solo","full-mix","a-cappella","carnatic"]},"durationSec":{"type":"number","minimum":0},"tempo":{"$ref":"#/$defs/Tempo"},"timeSignature":{"$ref":"#/$defs/TimeSignature"},"tonality":{"$ref":"#/$defs/Tonality"},"chords":{"type":"array","items":{"$ref":"#/$defs/Chord"}},"notes":{"type":"array","items":{"$ref":"#/$defs/Note"}},"sections":{"type":"array","items":{"$ref":"#/$defs/Section"}},"meta":{"$ref":"#/$defs/Meta"}},"$defs":{"Tempo":{"title":"Tempo","type":"object","additionalProperties":false,"required":["bpm","beats"],"properties":{"bpm":{"description":"Average tempo in beats per minute.","type":"number","exclusiveMinimum":0},"beats":{"description":"Beat times in seconds from the start of the audio.","type":"array","items":{"type":"number","minimum":0}},"downbeats":{"description":"Times in seconds of the first beat of each bar, from the start of the audio. Optional; added in 0.2.0.","type":"array","items":{"type":"number","minimum":0}}}},"TimeSignature":{"title":"TimeSignature","type":"object","additionalProperties":false,"required":["num","den"],"properties":{"num":{"type":"integer","minimum":1},"den":{"type":"integer","enum":[2,4,8,16]}}},"Tonality":{"title":"Tonality","type":"object","additionalProperties":false,"required":["key","mode","scale"],"properties":{"key":{"description":"Tonic note name, e.g. \"G\" or \"Bb\".","type":"string","pattern":"^[A-G](#|b)?$"},"mode":{"type":"string","enum":["major","minor","modal"]},"tonicHz":{"description":"Measured tonic frequency (shruti for Carnatic songs).","type":"number","exclusiveMinimum":0},"scale":{"description":"Pitch classes of the scale (0 = C), in scale order from the tonic.","type":"array","minItems":1,"uniqueItems":true,"items":{"type":"integer","minimum":0,"maximum":11}},"raga":{"description":"Raga name, for Carnatic songs.","type":"string","minLength":1}}},"Chord":{"title":"Chord","type":"object","additionalProperties":false,"required":["start","end","root","quality","label"],"properties":{"start":{"type":"number","minimum":0},"end":{"type":"number","minimum":0},"root":{"description":"Root pitch class (0 = C).","type":"integer","minimum":0,"maximum":11},"quality":{"description":"Chord quality, Harte-style shorthand.","type":"string","enum":["maj","min","dim","aug","sus2","sus4","5","maj6","min6","7","maj7","min7","minmaj7","dim7","hdim7","9","maj9","min9","add9"]},"bass":{"description":"Bass pitch class when it differs from the root (slash chord).","type":"integer","minimum":0,"maximum":11},"label":{"description":"Display label, e.g. \"G\", \"Am7\", \"C/E\".","type":"string","minLength":1}}},"Note":{"title":"Note","type":"object","additionalProperties":false,"required":["start","end","midi","velocity","hand","source"],"properties":{"start":{"type":"number","minimum":0},"end":{"type":"number","minimum":0},"midi":{"type":"integer","minimum":0,"maximum":127},"velocity":{"type":"integer","minimum":0,"maximum":127},"hand":{"type":"string","enum":["left","right"]},"source":{"type":"string","enum":["transcribed","arranged"]}}},"Section":{"title":"Section","type":"object","additionalProperties":false,"required":["start","end","label"],"properties":{"start":{"type":"number","minimum":0},"end":{"type":"number","minimum":0},"label":{"type":"string","minLength":1}}},"Confidence":{"title":"Confidence","description":"Pipeline confidence per estimate, 0 to 1.","type":"object","additionalProperties":false,"required":["key","tempo","chords"],"properties":{"key":{"type":"number","minimum":0,"maximum":1},"tempo":{"type":"number","minimum":0,"maximum":1},"chords":{"type":"number","minimum":0,"maximum":1},"notes":{"description":"Confidence in the transcribed notes. Optional; added in 0.3.0.","type":"number","minimum":0,"maximum":1}}},"Meta":{"title":"Meta","type":"object","additionalProperties":false,"required":["pipelineVersion","createdAt","confidence"],"properties":{"pipelineVersion":{"type":"string","minLength":1},"createdAt":{"type":"string","format":"date-time"},"confidence":{"$ref":"#/$defs/Confidence"}}}}};
const schema32 = {"title":"Tempo","type":"object","additionalProperties":false,"required":["bpm","beats"],"properties":{"bpm":{"description":"Average tempo in beats per minute.","type":"number","exclusiveMinimum":0},"beats":{"description":"Beat times in seconds from the start of the audio.","type":"array","items":{"type":"number","minimum":0}},"downbeats":{"description":"Times in seconds of the first beat of each bar, from the start of the audio. Optional; added in 0.2.0.","type":"array","items":{"type":"number","minimum":0}}}};
const schema33 = {"title":"TimeSignature","type":"object","additionalProperties":false,"required":["num","den"],"properties":{"num":{"type":"integer","minimum":1},"den":{"type":"integer","enum":[2,4,8,16]}}};
const schema34 = {"title":"Tonality","type":"object","additionalProperties":false,"required":["key","mode","scale"],"properties":{"key":{"description":"Tonic note name, e.g. \"G\" or \"Bb\".","type":"string","pattern":"^[A-G](#|b)?$"},"mode":{"type":"string","enum":["major","minor","modal"]},"tonicHz":{"description":"Measured tonic frequency (shruti for Carnatic songs).","type":"number","exclusiveMinimum":0},"scale":{"description":"Pitch classes of the scale (0 = C), in scale order from the tonic.","type":"array","minItems":1,"uniqueItems":true,"items":{"type":"integer","minimum":0,"maximum":11}},"raga":{"description":"Raga name, for Carnatic songs.","type":"string","minLength":1}}};
const schema35 = {"title":"Chord","type":"object","additionalProperties":false,"required":["start","end","root","quality","label"],"properties":{"start":{"type":"number","minimum":0},"end":{"type":"number","minimum":0},"root":{"description":"Root pitch class (0 = C).","type":"integer","minimum":0,"maximum":11},"quality":{"description":"Chord quality, Harte-style shorthand.","type":"string","enum":["maj","min","dim","aug","sus2","sus4","5","maj6","min6","7","maj7","min7","minmaj7","dim7","hdim7","9","maj9","min9","add9"]},"bass":{"description":"Bass pitch class when it differs from the root (slash chord).","type":"integer","minimum":0,"maximum":11},"label":{"description":"Display label, e.g. \"G\", \"Am7\", \"C/E\".","type":"string","minLength":1}}};
const schema36 = {"title":"Note","type":"object","additionalProperties":false,"required":["start","end","midi","velocity","hand","source"],"properties":{"start":{"type":"number","minimum":0},"end":{"type":"number","minimum":0},"midi":{"type":"integer","minimum":0,"maximum":127},"velocity":{"type":"integer","minimum":0,"maximum":127},"hand":{"type":"string","enum":["left","right"]},"source":{"type":"string","enum":["transcribed","arranged"]}}};
const schema37 = {"title":"Section","type":"object","additionalProperties":false,"required":["start","end","label"],"properties":{"start":{"type":"number","minimum":0},"end":{"type":"number","minimum":0},"label":{"type":"string","minLength":1}}};
const func1 = Object.prototype.hasOwnProperty;
const func2 = ucs2length;
const pattern4 = new RegExp("^[A-G](#|b)?$", "u");
const schema38 = {"title":"Meta","type":"object","additionalProperties":false,"required":["pipelineVersion","createdAt","confidence"],"properties":{"pipelineVersion":{"type":"string","minLength":1},"createdAt":{"type":"string","format":"date-time"},"confidence":{"$ref":"#/$defs/Confidence"}}};
const schema39 = {"title":"Confidence","description":"Pipeline confidence per estimate, 0 to 1.","type":"object","additionalProperties":false,"required":["key","tempo","chords"],"properties":{"key":{"type":"number","minimum":0,"maximum":1},"tempo":{"type":"number","minimum":0,"maximum":1},"chords":{"type":"number","minimum":0,"maximum":1},"notes":{"description":"Confidence in the transcribed notes. Optional; added in 0.3.0.","type":"number","minimum":0,"maximum":1}}};
const formats0 = fullFormats["date-time"];

function validate21(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate21.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.pipelineVersion === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "pipelineVersion"},message:"must have required property '"+"pipelineVersion"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.createdAt === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.confidence === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "confidence"},message:"must have required property '"+"confidence"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "pipelineVersion") || (key0 === "createdAt")) || (key0 === "confidence"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.pipelineVersion !== undefined){
let data0 = data.pipelineVersion;
if(typeof data0 === "string"){
if(func2(data0) < 1){
const err4 = {instancePath:instancePath+"/pipelineVersion",schemaPath:"#/properties/pipelineVersion/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/pipelineVersion",schemaPath:"#/properties/pipelineVersion/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data1 = data.createdAt;
if(typeof data1 === "string"){
if(!(formats0.validate(data1))){
const err6 = {instancePath:instancePath+"/createdAt",schemaPath:"#/properties/createdAt/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/createdAt",schemaPath:"#/properties/createdAt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.confidence !== undefined){
let data2 = data.confidence;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
if(data2.key === undefined){
const err8 = {instancePath:instancePath+"/confidence",schemaPath:"#/$defs/Confidence/required",keyword:"required",params:{missingProperty: "key"},message:"must have required property '"+"key"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data2.tempo === undefined){
const err9 = {instancePath:instancePath+"/confidence",schemaPath:"#/$defs/Confidence/required",keyword:"required",params:{missingProperty: "tempo"},message:"must have required property '"+"tempo"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data2.chords === undefined){
const err10 = {instancePath:instancePath+"/confidence",schemaPath:"#/$defs/Confidence/required",keyword:"required",params:{missingProperty: "chords"},message:"must have required property '"+"chords"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
for(const key1 in data2){
if(!((((key1 === "key") || (key1 === "tempo")) || (key1 === "chords")) || (key1 === "notes"))){
const err11 = {instancePath:instancePath+"/confidence",schemaPath:"#/$defs/Confidence/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data2.key !== undefined){
let data3 = data2.key;
if((typeof data3 == "number") && (isFinite(data3))){
if(data3 > 1 || isNaN(data3)){
const err12 = {instancePath:instancePath+"/confidence/key",schemaPath:"#/$defs/Confidence/properties/key/maximum",keyword:"maximum",params:{comparison: "<=", limit: 1},message:"must be <= 1"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data3 < 0 || isNaN(data3)){
const err13 = {instancePath:instancePath+"/confidence/key",schemaPath:"#/$defs/Confidence/properties/key/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/confidence/key",schemaPath:"#/$defs/Confidence/properties/key/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data2.tempo !== undefined){
let data4 = data2.tempo;
if((typeof data4 == "number") && (isFinite(data4))){
if(data4 > 1 || isNaN(data4)){
const err15 = {instancePath:instancePath+"/confidence/tempo",schemaPath:"#/$defs/Confidence/properties/tempo/maximum",keyword:"maximum",params:{comparison: "<=", limit: 1},message:"must be <= 1"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data4 < 0 || isNaN(data4)){
const err16 = {instancePath:instancePath+"/confidence/tempo",schemaPath:"#/$defs/Confidence/properties/tempo/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/confidence/tempo",schemaPath:"#/$defs/Confidence/properties/tempo/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data2.chords !== undefined){
let data5 = data2.chords;
if((typeof data5 == "number") && (isFinite(data5))){
if(data5 > 1 || isNaN(data5)){
const err18 = {instancePath:instancePath+"/confidence/chords",schemaPath:"#/$defs/Confidence/properties/chords/maximum",keyword:"maximum",params:{comparison: "<=", limit: 1},message:"must be <= 1"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(data5 < 0 || isNaN(data5)){
const err19 = {instancePath:instancePath+"/confidence/chords",schemaPath:"#/$defs/Confidence/properties/chords/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/confidence/chords",schemaPath:"#/$defs/Confidence/properties/chords/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data2.notes !== undefined){
let data6 = data2.notes;
if((typeof data6 == "number") && (isFinite(data6))){
if(data6 > 1 || isNaN(data6)){
const err21 = {instancePath:instancePath+"/confidence/notes",schemaPath:"#/$defs/Confidence/properties/notes/maximum",keyword:"maximum",params:{comparison: "<=", limit: 1},message:"must be <= 1"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data6 < 0 || isNaN(data6)){
const err22 = {instancePath:instancePath+"/confidence/notes",schemaPath:"#/$defs/Confidence/properties/notes/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
else {
const err23 = {instancePath:instancePath+"/confidence/notes",schemaPath:"#/$defs/Confidence/properties/notes/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
}
else {
const err24 = {instancePath:instancePath+"/confidence",schemaPath:"#/$defs/Confidence/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
}
else {
const err25 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
validate21.errors = vErrors;
return errors === 0;
}
validate21.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate20(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://isai.local/schema/song.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate20.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schemaVersion === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schemaVersion"},message:"must have required property '"+"schemaVersion"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.title === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.sourceType === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "sourceType"},message:"must have required property '"+"sourceType"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.durationSec === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "durationSec"},message:"must have required property '"+"durationSec"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.tempo === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "tempo"},message:"must have required property '"+"tempo"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.timeSignature === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "timeSignature"},message:"must have required property '"+"timeSignature"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.tonality === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "tonality"},message:"must have required property '"+"tonality"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.chords === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "chords"},message:"must have required property '"+"chords"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.notes === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "notes"},message:"must have required property '"+"notes"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.meta === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "meta"},message:"must have required property '"+"meta"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema31.properties, key0))){
const err11 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((data0 === "0.1.0") || (data0 === "0.2.0")) || (data0 === "0.3.0"))){
const err12 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/properties/schemaVersion/enum",keyword:"enum",params:{allowedValues: schema31.properties.schemaVersion.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) < 1){
const err13 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.title !== undefined){
let data2 = data.title;
if(typeof data2 === "string"){
if(func2(data2) < 1){
const err15 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.sourceType !== undefined){
let data3 = data.sourceType;
if(typeof data3 !== "string"){
const err17 = {instancePath:instancePath+"/sourceType",schemaPath:"#/properties/sourceType/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(!((((data3 === "piano-solo") || (data3 === "full-mix")) || (data3 === "a-cappella")) || (data3 === "carnatic"))){
const err18 = {instancePath:instancePath+"/sourceType",schemaPath:"#/properties/sourceType/enum",keyword:"enum",params:{allowedValues: schema31.properties.sourceType.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.durationSec !== undefined){
let data4 = data.durationSec;
if((typeof data4 == "number") && (isFinite(data4))){
if(data4 < 0 || isNaN(data4)){
const err19 = {instancePath:instancePath+"/durationSec",schemaPath:"#/properties/durationSec/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/durationSec",schemaPath:"#/properties/durationSec/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.tempo !== undefined){
let data5 = data.tempo;
if(data5 && typeof data5 == "object" && !Array.isArray(data5)){
if(data5.bpm === undefined){
const err21 = {instancePath:instancePath+"/tempo",schemaPath:"#/$defs/Tempo/required",keyword:"required",params:{missingProperty: "bpm"},message:"must have required property '"+"bpm"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data5.beats === undefined){
const err22 = {instancePath:instancePath+"/tempo",schemaPath:"#/$defs/Tempo/required",keyword:"required",params:{missingProperty: "beats"},message:"must have required property '"+"beats"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
for(const key1 in data5){
if(!(((key1 === "bpm") || (key1 === "beats")) || (key1 === "downbeats"))){
const err23 = {instancePath:instancePath+"/tempo",schemaPath:"#/$defs/Tempo/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data5.bpm !== undefined){
let data6 = data5.bpm;
if((typeof data6 == "number") && (isFinite(data6))){
if(data6 <= 0 || isNaN(data6)){
const err24 = {instancePath:instancePath+"/tempo/bpm",schemaPath:"#/$defs/Tempo/properties/bpm/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/tempo/bpm",schemaPath:"#/$defs/Tempo/properties/bpm/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data5.beats !== undefined){
let data7 = data5.beats;
if(Array.isArray(data7)){
const len0 = data7.length;
for(let i0=0; i0<len0; i0++){
let data8 = data7[i0];
if((typeof data8 == "number") && (isFinite(data8))){
if(data8 < 0 || isNaN(data8)){
const err26 = {instancePath:instancePath+"/tempo/beats/" + i0,schemaPath:"#/$defs/Tempo/properties/beats/items/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
else {
const err27 = {instancePath:instancePath+"/tempo/beats/" + i0,schemaPath:"#/$defs/Tempo/properties/beats/items/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
}
else {
const err28 = {instancePath:instancePath+"/tempo/beats",schemaPath:"#/$defs/Tempo/properties/beats/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data5.downbeats !== undefined){
let data9 = data5.downbeats;
if(Array.isArray(data9)){
const len1 = data9.length;
for(let i1=0; i1<len1; i1++){
let data10 = data9[i1];
if((typeof data10 == "number") && (isFinite(data10))){
if(data10 < 0 || isNaN(data10)){
const err29 = {instancePath:instancePath+"/tempo/downbeats/" + i1,schemaPath:"#/$defs/Tempo/properties/downbeats/items/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
else {
const err30 = {instancePath:instancePath+"/tempo/downbeats/" + i1,schemaPath:"#/$defs/Tempo/properties/downbeats/items/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
}
else {
const err31 = {instancePath:instancePath+"/tempo/downbeats",schemaPath:"#/$defs/Tempo/properties/downbeats/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
}
else {
const err32 = {instancePath:instancePath+"/tempo",schemaPath:"#/$defs/Tempo/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.timeSignature !== undefined){
let data11 = data.timeSignature;
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
if(data11.num === undefined){
const err33 = {instancePath:instancePath+"/timeSignature",schemaPath:"#/$defs/TimeSignature/required",keyword:"required",params:{missingProperty: "num"},message:"must have required property '"+"num"+"'"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if(data11.den === undefined){
const err34 = {instancePath:instancePath+"/timeSignature",schemaPath:"#/$defs/TimeSignature/required",keyword:"required",params:{missingProperty: "den"},message:"must have required property '"+"den"+"'"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
for(const key2 in data11){
if(!((key2 === "num") || (key2 === "den"))){
const err35 = {instancePath:instancePath+"/timeSignature",schemaPath:"#/$defs/TimeSignature/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data11.num !== undefined){
let data12 = data11.num;
if(!(((typeof data12 == "number") && (!(data12 % 1) && !isNaN(data12))) && (isFinite(data12)))){
const err36 = {instancePath:instancePath+"/timeSignature/num",schemaPath:"#/$defs/TimeSignature/properties/num/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if((typeof data12 == "number") && (isFinite(data12))){
if(data12 < 1 || isNaN(data12)){
const err37 = {instancePath:instancePath+"/timeSignature/num",schemaPath:"#/$defs/TimeSignature/properties/num/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
}
if(data11.den !== undefined){
let data13 = data11.den;
if(!(((typeof data13 == "number") && (!(data13 % 1) && !isNaN(data13))) && (isFinite(data13)))){
const err38 = {instancePath:instancePath+"/timeSignature/den",schemaPath:"#/$defs/TimeSignature/properties/den/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(!((((data13 === 2) || (data13 === 4)) || (data13 === 8)) || (data13 === 16))){
const err39 = {instancePath:instancePath+"/timeSignature/den",schemaPath:"#/$defs/TimeSignature/properties/den/enum",keyword:"enum",params:{allowedValues: schema33.properties.den.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
}
else {
const err40 = {instancePath:instancePath+"/timeSignature",schemaPath:"#/$defs/TimeSignature/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data.tonality !== undefined){
let data14 = data.tonality;
if(data14 && typeof data14 == "object" && !Array.isArray(data14)){
if(data14.key === undefined){
const err41 = {instancePath:instancePath+"/tonality",schemaPath:"#/$defs/Tonality/required",keyword:"required",params:{missingProperty: "key"},message:"must have required property '"+"key"+"'"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(data14.mode === undefined){
const err42 = {instancePath:instancePath+"/tonality",schemaPath:"#/$defs/Tonality/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if(data14.scale === undefined){
const err43 = {instancePath:instancePath+"/tonality",schemaPath:"#/$defs/Tonality/required",keyword:"required",params:{missingProperty: "scale"},message:"must have required property '"+"scale"+"'"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
for(const key3 in data14){
if(!(((((key3 === "key") || (key3 === "mode")) || (key3 === "tonicHz")) || (key3 === "scale")) || (key3 === "raga"))){
const err44 = {instancePath:instancePath+"/tonality",schemaPath:"#/$defs/Tonality/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
if(data14.key !== undefined){
let data15 = data14.key;
if(typeof data15 === "string"){
if(!pattern4.test(data15)){
const err45 = {instancePath:instancePath+"/tonality/key",schemaPath:"#/$defs/Tonality/properties/key/pattern",keyword:"pattern",params:{pattern: "^[A-G](#|b)?$"},message:"must match pattern \""+"^[A-G](#|b)?$"+"\""};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
else {
const err46 = {instancePath:instancePath+"/tonality/key",schemaPath:"#/$defs/Tonality/properties/key/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data14.mode !== undefined){
let data16 = data14.mode;
if(typeof data16 !== "string"){
const err47 = {instancePath:instancePath+"/tonality/mode",schemaPath:"#/$defs/Tonality/properties/mode/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if(!(((data16 === "major") || (data16 === "minor")) || (data16 === "modal"))){
const err48 = {instancePath:instancePath+"/tonality/mode",schemaPath:"#/$defs/Tonality/properties/mode/enum",keyword:"enum",params:{allowedValues: schema34.properties.mode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
if(data14.tonicHz !== undefined){
let data17 = data14.tonicHz;
if((typeof data17 == "number") && (isFinite(data17))){
if(data17 <= 0 || isNaN(data17)){
const err49 = {instancePath:instancePath+"/tonality/tonicHz",schemaPath:"#/$defs/Tonality/properties/tonicHz/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
else {
const err50 = {instancePath:instancePath+"/tonality/tonicHz",schemaPath:"#/$defs/Tonality/properties/tonicHz/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data14.scale !== undefined){
let data18 = data14.scale;
if(Array.isArray(data18)){
if(data18.length < 1){
const err51 = {instancePath:instancePath+"/tonality/scale",schemaPath:"#/$defs/Tonality/properties/scale/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
const len2 = data18.length;
for(let i2=0; i2<len2; i2++){
let data19 = data18[i2];
if(!(((typeof data19 == "number") && (!(data19 % 1) && !isNaN(data19))) && (isFinite(data19)))){
const err52 = {instancePath:instancePath+"/tonality/scale/" + i2,schemaPath:"#/$defs/Tonality/properties/scale/items/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if((typeof data19 == "number") && (isFinite(data19))){
if(data19 > 11 || isNaN(data19)){
const err53 = {instancePath:instancePath+"/tonality/scale/" + i2,schemaPath:"#/$defs/Tonality/properties/scale/items/maximum",keyword:"maximum",params:{comparison: "<=", limit: 11},message:"must be <= 11"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
if(data19 < 0 || isNaN(data19)){
const err54 = {instancePath:instancePath+"/tonality/scale/" + i2,schemaPath:"#/$defs/Tonality/properties/scale/items/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
}
let i3 = data18.length;
let j0;
if(i3 > 1){
const indices0 = {};
for(;i3--;){
let item0 = data18[i3];
if(!(((typeof item0 == "number") && (!(item0 % 1) && !isNaN(item0))) && (isFinite(item0)))){
continue;
}
if(typeof indices0[item0] == "number"){
j0 = indices0[item0];
const err55 = {instancePath:instancePath+"/tonality/scale",schemaPath:"#/$defs/Tonality/properties/scale/uniqueItems",keyword:"uniqueItems",params:{i: i3, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i3+" are identical)"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
break;
}
indices0[item0] = i3;
}
}
}
else {
const err56 = {instancePath:instancePath+"/tonality/scale",schemaPath:"#/$defs/Tonality/properties/scale/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
if(data14.raga !== undefined){
let data20 = data14.raga;
if(typeof data20 === "string"){
if(func2(data20) < 1){
const err57 = {instancePath:instancePath+"/tonality/raga",schemaPath:"#/$defs/Tonality/properties/raga/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
else {
const err58 = {instancePath:instancePath+"/tonality/raga",schemaPath:"#/$defs/Tonality/properties/raga/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
}
else {
const err59 = {instancePath:instancePath+"/tonality",schemaPath:"#/$defs/Tonality/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
if(data.chords !== undefined){
let data21 = data.chords;
if(Array.isArray(data21)){
const len3 = data21.length;
for(let i4=0; i4<len3; i4++){
let data22 = data21[i4];
if(data22 && typeof data22 == "object" && !Array.isArray(data22)){
if(data22.start === undefined){
const err60 = {instancePath:instancePath+"/chords/" + i4,schemaPath:"#/$defs/Chord/required",keyword:"required",params:{missingProperty: "start"},message:"must have required property '"+"start"+"'"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
if(data22.end === undefined){
const err61 = {instancePath:instancePath+"/chords/" + i4,schemaPath:"#/$defs/Chord/required",keyword:"required",params:{missingProperty: "end"},message:"must have required property '"+"end"+"'"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
if(data22.root === undefined){
const err62 = {instancePath:instancePath+"/chords/" + i4,schemaPath:"#/$defs/Chord/required",keyword:"required",params:{missingProperty: "root"},message:"must have required property '"+"root"+"'"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
if(data22.quality === undefined){
const err63 = {instancePath:instancePath+"/chords/" + i4,schemaPath:"#/$defs/Chord/required",keyword:"required",params:{missingProperty: "quality"},message:"must have required property '"+"quality"+"'"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
if(data22.label === undefined){
const err64 = {instancePath:instancePath+"/chords/" + i4,schemaPath:"#/$defs/Chord/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
for(const key4 in data22){
if(!((((((key4 === "start") || (key4 === "end")) || (key4 === "root")) || (key4 === "quality")) || (key4 === "bass")) || (key4 === "label"))){
const err65 = {instancePath:instancePath+"/chords/" + i4,schemaPath:"#/$defs/Chord/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
if(data22.start !== undefined){
let data23 = data22.start;
if((typeof data23 == "number") && (isFinite(data23))){
if(data23 < 0 || isNaN(data23)){
const err66 = {instancePath:instancePath+"/chords/" + i4+"/start",schemaPath:"#/$defs/Chord/properties/start/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
else {
const err67 = {instancePath:instancePath+"/chords/" + i4+"/start",schemaPath:"#/$defs/Chord/properties/start/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
if(data22.end !== undefined){
let data24 = data22.end;
if((typeof data24 == "number") && (isFinite(data24))){
if(data24 < 0 || isNaN(data24)){
const err68 = {instancePath:instancePath+"/chords/" + i4+"/end",schemaPath:"#/$defs/Chord/properties/end/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
else {
const err69 = {instancePath:instancePath+"/chords/" + i4+"/end",schemaPath:"#/$defs/Chord/properties/end/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
if(data22.root !== undefined){
let data25 = data22.root;
if(!(((typeof data25 == "number") && (!(data25 % 1) && !isNaN(data25))) && (isFinite(data25)))){
const err70 = {instancePath:instancePath+"/chords/" + i4+"/root",schemaPath:"#/$defs/Chord/properties/root/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if((typeof data25 == "number") && (isFinite(data25))){
if(data25 > 11 || isNaN(data25)){
const err71 = {instancePath:instancePath+"/chords/" + i4+"/root",schemaPath:"#/$defs/Chord/properties/root/maximum",keyword:"maximum",params:{comparison: "<=", limit: 11},message:"must be <= 11"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
if(data25 < 0 || isNaN(data25)){
const err72 = {instancePath:instancePath+"/chords/" + i4+"/root",schemaPath:"#/$defs/Chord/properties/root/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
}
if(data22.quality !== undefined){
let data26 = data22.quality;
if(typeof data26 !== "string"){
const err73 = {instancePath:instancePath+"/chords/" + i4+"/quality",schemaPath:"#/$defs/Chord/properties/quality/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
if(!(((((((((((((((((((data26 === "maj") || (data26 === "min")) || (data26 === "dim")) || (data26 === "aug")) || (data26 === "sus2")) || (data26 === "sus4")) || (data26 === "5")) || (data26 === "maj6")) || (data26 === "min6")) || (data26 === "7")) || (data26 === "maj7")) || (data26 === "min7")) || (data26 === "minmaj7")) || (data26 === "dim7")) || (data26 === "hdim7")) || (data26 === "9")) || (data26 === "maj9")) || (data26 === "min9")) || (data26 === "add9"))){
const err74 = {instancePath:instancePath+"/chords/" + i4+"/quality",schemaPath:"#/$defs/Chord/properties/quality/enum",keyword:"enum",params:{allowedValues: schema35.properties.quality.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
if(data22.bass !== undefined){
let data27 = data22.bass;
if(!(((typeof data27 == "number") && (!(data27 % 1) && !isNaN(data27))) && (isFinite(data27)))){
const err75 = {instancePath:instancePath+"/chords/" + i4+"/bass",schemaPath:"#/$defs/Chord/properties/bass/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
if((typeof data27 == "number") && (isFinite(data27))){
if(data27 > 11 || isNaN(data27)){
const err76 = {instancePath:instancePath+"/chords/" + i4+"/bass",schemaPath:"#/$defs/Chord/properties/bass/maximum",keyword:"maximum",params:{comparison: "<=", limit: 11},message:"must be <= 11"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
if(data27 < 0 || isNaN(data27)){
const err77 = {instancePath:instancePath+"/chords/" + i4+"/bass",schemaPath:"#/$defs/Chord/properties/bass/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
}
if(data22.label !== undefined){
let data28 = data22.label;
if(typeof data28 === "string"){
if(func2(data28) < 1){
const err78 = {instancePath:instancePath+"/chords/" + i4+"/label",schemaPath:"#/$defs/Chord/properties/label/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
else {
const err79 = {instancePath:instancePath+"/chords/" + i4+"/label",schemaPath:"#/$defs/Chord/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
}
else {
const err80 = {instancePath:instancePath+"/chords/" + i4,schemaPath:"#/$defs/Chord/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
}
}
else {
const err81 = {instancePath:instancePath+"/chords",schemaPath:"#/properties/chords/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
if(data.notes !== undefined){
let data29 = data.notes;
if(Array.isArray(data29)){
const len4 = data29.length;
for(let i5=0; i5<len4; i5++){
let data30 = data29[i5];
if(data30 && typeof data30 == "object" && !Array.isArray(data30)){
if(data30.start === undefined){
const err82 = {instancePath:instancePath+"/notes/" + i5,schemaPath:"#/$defs/Note/required",keyword:"required",params:{missingProperty: "start"},message:"must have required property '"+"start"+"'"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
if(data30.end === undefined){
const err83 = {instancePath:instancePath+"/notes/" + i5,schemaPath:"#/$defs/Note/required",keyword:"required",params:{missingProperty: "end"},message:"must have required property '"+"end"+"'"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
if(data30.midi === undefined){
const err84 = {instancePath:instancePath+"/notes/" + i5,schemaPath:"#/$defs/Note/required",keyword:"required",params:{missingProperty: "midi"},message:"must have required property '"+"midi"+"'"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
if(data30.velocity === undefined){
const err85 = {instancePath:instancePath+"/notes/" + i5,schemaPath:"#/$defs/Note/required",keyword:"required",params:{missingProperty: "velocity"},message:"must have required property '"+"velocity"+"'"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
if(data30.hand === undefined){
const err86 = {instancePath:instancePath+"/notes/" + i5,schemaPath:"#/$defs/Note/required",keyword:"required",params:{missingProperty: "hand"},message:"must have required property '"+"hand"+"'"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
if(data30.source === undefined){
const err87 = {instancePath:instancePath+"/notes/" + i5,schemaPath:"#/$defs/Note/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
for(const key5 in data30){
if(!((((((key5 === "start") || (key5 === "end")) || (key5 === "midi")) || (key5 === "velocity")) || (key5 === "hand")) || (key5 === "source"))){
const err88 = {instancePath:instancePath+"/notes/" + i5,schemaPath:"#/$defs/Note/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
}
if(data30.start !== undefined){
let data31 = data30.start;
if((typeof data31 == "number") && (isFinite(data31))){
if(data31 < 0 || isNaN(data31)){
const err89 = {instancePath:instancePath+"/notes/" + i5+"/start",schemaPath:"#/$defs/Note/properties/start/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
else {
const err90 = {instancePath:instancePath+"/notes/" + i5+"/start",schemaPath:"#/$defs/Note/properties/start/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
}
if(data30.end !== undefined){
let data32 = data30.end;
if((typeof data32 == "number") && (isFinite(data32))){
if(data32 < 0 || isNaN(data32)){
const err91 = {instancePath:instancePath+"/notes/" + i5+"/end",schemaPath:"#/$defs/Note/properties/end/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
}
else {
const err92 = {instancePath:instancePath+"/notes/" + i5+"/end",schemaPath:"#/$defs/Note/properties/end/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
}
if(data30.midi !== undefined){
let data33 = data30.midi;
if(!(((typeof data33 == "number") && (!(data33 % 1) && !isNaN(data33))) && (isFinite(data33)))){
const err93 = {instancePath:instancePath+"/notes/" + i5+"/midi",schemaPath:"#/$defs/Note/properties/midi/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
if((typeof data33 == "number") && (isFinite(data33))){
if(data33 > 127 || isNaN(data33)){
const err94 = {instancePath:instancePath+"/notes/" + i5+"/midi",schemaPath:"#/$defs/Note/properties/midi/maximum",keyword:"maximum",params:{comparison: "<=", limit: 127},message:"must be <= 127"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
if(data33 < 0 || isNaN(data33)){
const err95 = {instancePath:instancePath+"/notes/" + i5+"/midi",schemaPath:"#/$defs/Note/properties/midi/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
}
}
if(data30.velocity !== undefined){
let data34 = data30.velocity;
if(!(((typeof data34 == "number") && (!(data34 % 1) && !isNaN(data34))) && (isFinite(data34)))){
const err96 = {instancePath:instancePath+"/notes/" + i5+"/velocity",schemaPath:"#/$defs/Note/properties/velocity/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
if((typeof data34 == "number") && (isFinite(data34))){
if(data34 > 127 || isNaN(data34)){
const err97 = {instancePath:instancePath+"/notes/" + i5+"/velocity",schemaPath:"#/$defs/Note/properties/velocity/maximum",keyword:"maximum",params:{comparison: "<=", limit: 127},message:"must be <= 127"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
if(data34 < 0 || isNaN(data34)){
const err98 = {instancePath:instancePath+"/notes/" + i5+"/velocity",schemaPath:"#/$defs/Note/properties/velocity/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
}
}
if(data30.hand !== undefined){
let data35 = data30.hand;
if(typeof data35 !== "string"){
const err99 = {instancePath:instancePath+"/notes/" + i5+"/hand",schemaPath:"#/$defs/Note/properties/hand/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
if(!((data35 === "left") || (data35 === "right"))){
const err100 = {instancePath:instancePath+"/notes/" + i5+"/hand",schemaPath:"#/$defs/Note/properties/hand/enum",keyword:"enum",params:{allowedValues: schema36.properties.hand.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
}
if(data30.source !== undefined){
let data36 = data30.source;
if(typeof data36 !== "string"){
const err101 = {instancePath:instancePath+"/notes/" + i5+"/source",schemaPath:"#/$defs/Note/properties/source/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
if(!((data36 === "transcribed") || (data36 === "arranged"))){
const err102 = {instancePath:instancePath+"/notes/" + i5+"/source",schemaPath:"#/$defs/Note/properties/source/enum",keyword:"enum",params:{allowedValues: schema36.properties.source.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
}
}
else {
const err103 = {instancePath:instancePath+"/notes/" + i5,schemaPath:"#/$defs/Note/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
}
}
else {
const err104 = {instancePath:instancePath+"/notes",schemaPath:"#/properties/notes/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
}
if(data.sections !== undefined){
let data37 = data.sections;
if(Array.isArray(data37)){
const len5 = data37.length;
for(let i6=0; i6<len5; i6++){
let data38 = data37[i6];
if(data38 && typeof data38 == "object" && !Array.isArray(data38)){
if(data38.start === undefined){
const err105 = {instancePath:instancePath+"/sections/" + i6,schemaPath:"#/$defs/Section/required",keyword:"required",params:{missingProperty: "start"},message:"must have required property '"+"start"+"'"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
if(data38.end === undefined){
const err106 = {instancePath:instancePath+"/sections/" + i6,schemaPath:"#/$defs/Section/required",keyword:"required",params:{missingProperty: "end"},message:"must have required property '"+"end"+"'"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
if(data38.label === undefined){
const err107 = {instancePath:instancePath+"/sections/" + i6,schemaPath:"#/$defs/Section/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
for(const key6 in data38){
if(!(((key6 === "start") || (key6 === "end")) || (key6 === "label"))){
const err108 = {instancePath:instancePath+"/sections/" + i6,schemaPath:"#/$defs/Section/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
}
if(data38.start !== undefined){
let data39 = data38.start;
if((typeof data39 == "number") && (isFinite(data39))){
if(data39 < 0 || isNaN(data39)){
const err109 = {instancePath:instancePath+"/sections/" + i6+"/start",schemaPath:"#/$defs/Section/properties/start/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
}
else {
const err110 = {instancePath:instancePath+"/sections/" + i6+"/start",schemaPath:"#/$defs/Section/properties/start/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
}
if(data38.end !== undefined){
let data40 = data38.end;
if((typeof data40 == "number") && (isFinite(data40))){
if(data40 < 0 || isNaN(data40)){
const err111 = {instancePath:instancePath+"/sections/" + i6+"/end",schemaPath:"#/$defs/Section/properties/end/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
}
else {
const err112 = {instancePath:instancePath+"/sections/" + i6+"/end",schemaPath:"#/$defs/Section/properties/end/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
}
if(data38.label !== undefined){
let data41 = data38.label;
if(typeof data41 === "string"){
if(func2(data41) < 1){
const err113 = {instancePath:instancePath+"/sections/" + i6+"/label",schemaPath:"#/$defs/Section/properties/label/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
}
}
else {
const err114 = {instancePath:instancePath+"/sections/" + i6+"/label",schemaPath:"#/$defs/Section/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
}
}
else {
const err115 = {instancePath:instancePath+"/sections/" + i6,schemaPath:"#/$defs/Section/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
}
}
else {
const err116 = {instancePath:instancePath+"/sections",schemaPath:"#/properties/sections/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
}
if(data.meta !== undefined){
if(!(validate21(data.meta, {instancePath:instancePath+"/meta",parentData:data,parentDataProperty:"meta",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
errors = vErrors.length;
}
}
}
else {
const err117 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
validate20.errors = vErrors;
return errors === 0;
}
validate20.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

