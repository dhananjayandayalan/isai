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
const schema31 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://isai.local/schema/song.schema.json","title":"Song","description":"One analysed song: tempo, tonality, chords and a playable two-hand arrangement. Contract between pipeline and web (ADR 0002).","type":"object","additionalProperties":false,"required":["schemaVersion","id","title","sourceType","durationSec","tempo","timeSignature","tonality","chords","notes","meta"],"properties":{"schemaVersion":{"description":"Version of this schema the file was written against.","const":"0.1.0"},"id":{"description":"Stable identifier of the song analysis.","type":"string","minLength":1},"title":{"type":"string","minLength":1},"sourceType":{"description":"Which pipeline path produced the song.","type":"string","enum":["piano-solo","full-mix","a-cappella","carnatic"]},"durationSec":{"type":"number","minimum":0},"tempo":{"$ref":"#/$defs/Tempo"},"timeSignature":{"$ref":"#/$defs/TimeSignature"},"tonality":{"$ref":"#/$defs/Tonality"},"chords":{"type":"array","items":{"$ref":"#/$defs/Chord"}},"notes":{"type":"array","items":{"$ref":"#/$defs/Note"}},"sections":{"type":"array","items":{"$ref":"#/$defs/Section"}},"meta":{"$ref":"#/$defs/Meta"}},"$defs":{"Tempo":{"title":"Tempo","type":"object","additionalProperties":false,"required":["bpm","beats"],"properties":{"bpm":{"description":"Average tempo in beats per minute.","type":"number","exclusiveMinimum":0},"beats":{"description":"Beat times in seconds from the start of the audio.","type":"array","items":{"type":"number","minimum":0}}}},"TimeSignature":{"title":"TimeSignature","type":"object","additionalProperties":false,"required":["num","den"],"properties":{"num":{"type":"integer","minimum":1},"den":{"type":"integer","enum":[2,4,8,16]}}},"Tonality":{"title":"Tonality","type":"object","additionalProperties":false,"required":["key","mode","scale"],"properties":{"key":{"description":"Tonic note name, e.g. \"G\" or \"Bb\".","type":"string","pattern":"^[A-G](#|b)?$"},"mode":{"type":"string","enum":["major","minor","modal"]},"tonicHz":{"description":"Measured tonic frequency (shruti for Carnatic songs).","type":"number","exclusiveMinimum":0},"scale":{"description":"Pitch classes of the scale (0 = C), in scale order from the tonic.","type":"array","minItems":1,"uniqueItems":true,"items":{"type":"integer","minimum":0,"maximum":11}},"raga":{"description":"Raga name, for Carnatic songs.","type":"string","minLength":1}}},"Chord":{"title":"Chord","type":"object","additionalProperties":false,"required":["start","end","root","quality","label"],"properties":{"start":{"type":"number","minimum":0},"end":{"type":"number","minimum":0},"root":{"description":"Root pitch class (0 = C).","type":"integer","minimum":0,"maximum":11},"quality":{"description":"Chord quality, Harte-style shorthand.","type":"string","enum":["maj","min","dim","aug","sus2","sus4","5","maj6","min6","7","maj7","min7","minmaj7","dim7","hdim7","9","maj9","min9","add9"]},"bass":{"description":"Bass pitch class when it differs from the root (slash chord).","type":"integer","minimum":0,"maximum":11},"label":{"description":"Display label, e.g. \"G\", \"Am7\", \"C/E\".","type":"string","minLength":1}}},"Note":{"title":"Note","type":"object","additionalProperties":false,"required":["start","end","midi","velocity","hand","source"],"properties":{"start":{"type":"number","minimum":0},"end":{"type":"number","minimum":0},"midi":{"type":"integer","minimum":0,"maximum":127},"velocity":{"type":"integer","minimum":0,"maximum":127},"hand":{"type":"string","enum":["left","right"]},"source":{"type":"string","enum":["transcribed","arranged"]}}},"Section":{"title":"Section","type":"object","additionalProperties":false,"required":["start","end","label"],"properties":{"start":{"type":"number","minimum":0},"end":{"type":"number","minimum":0},"label":{"type":"string","minLength":1}}},"Confidence":{"title":"Confidence","description":"Pipeline confidence per estimate, 0 to 1.","type":"object","additionalProperties":false,"required":["key","tempo","chords"],"properties":{"key":{"type":"number","minimum":0,"maximum":1},"tempo":{"type":"number","minimum":0,"maximum":1},"chords":{"type":"number","minimum":0,"maximum":1}}},"Meta":{"title":"Meta","type":"object","additionalProperties":false,"required":["pipelineVersion","createdAt","confidence"],"properties":{"pipelineVersion":{"type":"string","minLength":1},"createdAt":{"type":"string","format":"date-time"},"confidence":{"$ref":"#/$defs/Confidence"}}}}};
const schema32 = {"title":"Tempo","type":"object","additionalProperties":false,"required":["bpm","beats"],"properties":{"bpm":{"description":"Average tempo in beats per minute.","type":"number","exclusiveMinimum":0},"beats":{"description":"Beat times in seconds from the start of the audio.","type":"array","items":{"type":"number","minimum":0}}}};
const schema33 = {"title":"TimeSignature","type":"object","additionalProperties":false,"required":["num","den"],"properties":{"num":{"type":"integer","minimum":1},"den":{"type":"integer","enum":[2,4,8,16]}}};
const schema34 = {"title":"Tonality","type":"object","additionalProperties":false,"required":["key","mode","scale"],"properties":{"key":{"description":"Tonic note name, e.g. \"G\" or \"Bb\".","type":"string","pattern":"^[A-G](#|b)?$"},"mode":{"type":"string","enum":["major","minor","modal"]},"tonicHz":{"description":"Measured tonic frequency (shruti for Carnatic songs).","type":"number","exclusiveMinimum":0},"scale":{"description":"Pitch classes of the scale (0 = C), in scale order from the tonic.","type":"array","minItems":1,"uniqueItems":true,"items":{"type":"integer","minimum":0,"maximum":11}},"raga":{"description":"Raga name, for Carnatic songs.","type":"string","minLength":1}}};
const schema35 = {"title":"Chord","type":"object","additionalProperties":false,"required":["start","end","root","quality","label"],"properties":{"start":{"type":"number","minimum":0},"end":{"type":"number","minimum":0},"root":{"description":"Root pitch class (0 = C).","type":"integer","minimum":0,"maximum":11},"quality":{"description":"Chord quality, Harte-style shorthand.","type":"string","enum":["maj","min","dim","aug","sus2","sus4","5","maj6","min6","7","maj7","min7","minmaj7","dim7","hdim7","9","maj9","min9","add9"]},"bass":{"description":"Bass pitch class when it differs from the root (slash chord).","type":"integer","minimum":0,"maximum":11},"label":{"description":"Display label, e.g. \"G\", \"Am7\", \"C/E\".","type":"string","minLength":1}}};
const schema36 = {"title":"Note","type":"object","additionalProperties":false,"required":["start","end","midi","velocity","hand","source"],"properties":{"start":{"type":"number","minimum":0},"end":{"type":"number","minimum":0},"midi":{"type":"integer","minimum":0,"maximum":127},"velocity":{"type":"integer","minimum":0,"maximum":127},"hand":{"type":"string","enum":["left","right"]},"source":{"type":"string","enum":["transcribed","arranged"]}}};
const schema37 = {"title":"Section","type":"object","additionalProperties":false,"required":["start","end","label"],"properties":{"start":{"type":"number","minimum":0},"end":{"type":"number","minimum":0},"label":{"type":"string","minLength":1}}};
const func1 = Object.prototype.hasOwnProperty;
const func2 = ucs2length;
const pattern4 = new RegExp("^[A-G](#|b)?$", "u");
const schema38 = {"title":"Meta","type":"object","additionalProperties":false,"required":["pipelineVersion","createdAt","confidence"],"properties":{"pipelineVersion":{"type":"string","minLength":1},"createdAt":{"type":"string","format":"date-time"},"confidence":{"$ref":"#/$defs/Confidence"}}};
const schema39 = {"title":"Confidence","description":"Pipeline confidence per estimate, 0 to 1.","type":"object","additionalProperties":false,"required":["key","tempo","chords"],"properties":{"key":{"type":"number","minimum":0,"maximum":1},"tempo":{"type":"number","minimum":0,"maximum":1},"chords":{"type":"number","minimum":0,"maximum":1}}};
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
if(!(((key1 === "key") || (key1 === "tempo")) || (key1 === "chords"))){
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
}
else {
const err21 = {instancePath:instancePath+"/confidence",schemaPath:"#/$defs/Confidence/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
else {
const err22 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
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
if("0.1.0" !== data.schemaVersion){
const err12 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/properties/schemaVersion/const",keyword:"const",params:{allowedValue: "0.1.0"},message:"must be equal to constant"};
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
if(!((key1 === "bpm") || (key1 === "beats"))){
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
}
else {
const err29 = {instancePath:instancePath+"/tempo",schemaPath:"#/$defs/Tempo/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.timeSignature !== undefined){
let data9 = data.timeSignature;
if(data9 && typeof data9 == "object" && !Array.isArray(data9)){
if(data9.num === undefined){
const err30 = {instancePath:instancePath+"/timeSignature",schemaPath:"#/$defs/TimeSignature/required",keyword:"required",params:{missingProperty: "num"},message:"must have required property '"+"num"+"'"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(data9.den === undefined){
const err31 = {instancePath:instancePath+"/timeSignature",schemaPath:"#/$defs/TimeSignature/required",keyword:"required",params:{missingProperty: "den"},message:"must have required property '"+"den"+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
for(const key2 in data9){
if(!((key2 === "num") || (key2 === "den"))){
const err32 = {instancePath:instancePath+"/timeSignature",schemaPath:"#/$defs/TimeSignature/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data9.num !== undefined){
let data10 = data9.num;
if(!(((typeof data10 == "number") && (!(data10 % 1) && !isNaN(data10))) && (isFinite(data10)))){
const err33 = {instancePath:instancePath+"/timeSignature/num",schemaPath:"#/$defs/TimeSignature/properties/num/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if((typeof data10 == "number") && (isFinite(data10))){
if(data10 < 1 || isNaN(data10)){
const err34 = {instancePath:instancePath+"/timeSignature/num",schemaPath:"#/$defs/TimeSignature/properties/num/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
}
if(data9.den !== undefined){
let data11 = data9.den;
if(!(((typeof data11 == "number") && (!(data11 % 1) && !isNaN(data11))) && (isFinite(data11)))){
const err35 = {instancePath:instancePath+"/timeSignature/den",schemaPath:"#/$defs/TimeSignature/properties/den/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(!((((data11 === 2) || (data11 === 4)) || (data11 === 8)) || (data11 === 16))){
const err36 = {instancePath:instancePath+"/timeSignature/den",schemaPath:"#/$defs/TimeSignature/properties/den/enum",keyword:"enum",params:{allowedValues: schema33.properties.den.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
}
else {
const err37 = {instancePath:instancePath+"/timeSignature",schemaPath:"#/$defs/TimeSignature/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data.tonality !== undefined){
let data12 = data.tonality;
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
if(data12.key === undefined){
const err38 = {instancePath:instancePath+"/tonality",schemaPath:"#/$defs/Tonality/required",keyword:"required",params:{missingProperty: "key"},message:"must have required property '"+"key"+"'"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(data12.mode === undefined){
const err39 = {instancePath:instancePath+"/tonality",schemaPath:"#/$defs/Tonality/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if(data12.scale === undefined){
const err40 = {instancePath:instancePath+"/tonality",schemaPath:"#/$defs/Tonality/required",keyword:"required",params:{missingProperty: "scale"},message:"must have required property '"+"scale"+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
for(const key3 in data12){
if(!(((((key3 === "key") || (key3 === "mode")) || (key3 === "tonicHz")) || (key3 === "scale")) || (key3 === "raga"))){
const err41 = {instancePath:instancePath+"/tonality",schemaPath:"#/$defs/Tonality/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data12.key !== undefined){
let data13 = data12.key;
if(typeof data13 === "string"){
if(!pattern4.test(data13)){
const err42 = {instancePath:instancePath+"/tonality/key",schemaPath:"#/$defs/Tonality/properties/key/pattern",keyword:"pattern",params:{pattern: "^[A-G](#|b)?$"},message:"must match pattern \""+"^[A-G](#|b)?$"+"\""};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
else {
const err43 = {instancePath:instancePath+"/tonality/key",schemaPath:"#/$defs/Tonality/properties/key/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data12.mode !== undefined){
let data14 = data12.mode;
if(typeof data14 !== "string"){
const err44 = {instancePath:instancePath+"/tonality/mode",schemaPath:"#/$defs/Tonality/properties/mode/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(!(((data14 === "major") || (data14 === "minor")) || (data14 === "modal"))){
const err45 = {instancePath:instancePath+"/tonality/mode",schemaPath:"#/$defs/Tonality/properties/mode/enum",keyword:"enum",params:{allowedValues: schema34.properties.mode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data12.tonicHz !== undefined){
let data15 = data12.tonicHz;
if((typeof data15 == "number") && (isFinite(data15))){
if(data15 <= 0 || isNaN(data15)){
const err46 = {instancePath:instancePath+"/tonality/tonicHz",schemaPath:"#/$defs/Tonality/properties/tonicHz/exclusiveMinimum",keyword:"exclusiveMinimum",params:{comparison: ">", limit: 0},message:"must be > 0"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
else {
const err47 = {instancePath:instancePath+"/tonality/tonicHz",schemaPath:"#/$defs/Tonality/properties/tonicHz/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
if(data12.scale !== undefined){
let data16 = data12.scale;
if(Array.isArray(data16)){
if(data16.length < 1){
const err48 = {instancePath:instancePath+"/tonality/scale",schemaPath:"#/$defs/Tonality/properties/scale/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
const len1 = data16.length;
for(let i1=0; i1<len1; i1++){
let data17 = data16[i1];
if(!(((typeof data17 == "number") && (!(data17 % 1) && !isNaN(data17))) && (isFinite(data17)))){
const err49 = {instancePath:instancePath+"/tonality/scale/" + i1,schemaPath:"#/$defs/Tonality/properties/scale/items/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
if((typeof data17 == "number") && (isFinite(data17))){
if(data17 > 11 || isNaN(data17)){
const err50 = {instancePath:instancePath+"/tonality/scale/" + i1,schemaPath:"#/$defs/Tonality/properties/scale/items/maximum",keyword:"maximum",params:{comparison: "<=", limit: 11},message:"must be <= 11"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
if(data17 < 0 || isNaN(data17)){
const err51 = {instancePath:instancePath+"/tonality/scale/" + i1,schemaPath:"#/$defs/Tonality/properties/scale/items/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
}
let i2 = data16.length;
let j0;
if(i2 > 1){
const indices0 = {};
for(;i2--;){
let item0 = data16[i2];
if(!(((typeof item0 == "number") && (!(item0 % 1) && !isNaN(item0))) && (isFinite(item0)))){
continue;
}
if(typeof indices0[item0] == "number"){
j0 = indices0[item0];
const err52 = {instancePath:instancePath+"/tonality/scale",schemaPath:"#/$defs/Tonality/properties/scale/uniqueItems",keyword:"uniqueItems",params:{i: i2, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i2+" are identical)"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
break;
}
indices0[item0] = i2;
}
}
}
else {
const err53 = {instancePath:instancePath+"/tonality/scale",schemaPath:"#/$defs/Tonality/properties/scale/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
if(data12.raga !== undefined){
let data18 = data12.raga;
if(typeof data18 === "string"){
if(func2(data18) < 1){
const err54 = {instancePath:instancePath+"/tonality/raga",schemaPath:"#/$defs/Tonality/properties/raga/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
else {
const err55 = {instancePath:instancePath+"/tonality/raga",schemaPath:"#/$defs/Tonality/properties/raga/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
}
else {
const err56 = {instancePath:instancePath+"/tonality",schemaPath:"#/$defs/Tonality/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
if(data.chords !== undefined){
let data19 = data.chords;
if(Array.isArray(data19)){
const len2 = data19.length;
for(let i3=0; i3<len2; i3++){
let data20 = data19[i3];
if(data20 && typeof data20 == "object" && !Array.isArray(data20)){
if(data20.start === undefined){
const err57 = {instancePath:instancePath+"/chords/" + i3,schemaPath:"#/$defs/Chord/required",keyword:"required",params:{missingProperty: "start"},message:"must have required property '"+"start"+"'"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
if(data20.end === undefined){
const err58 = {instancePath:instancePath+"/chords/" + i3,schemaPath:"#/$defs/Chord/required",keyword:"required",params:{missingProperty: "end"},message:"must have required property '"+"end"+"'"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if(data20.root === undefined){
const err59 = {instancePath:instancePath+"/chords/" + i3,schemaPath:"#/$defs/Chord/required",keyword:"required",params:{missingProperty: "root"},message:"must have required property '"+"root"+"'"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if(data20.quality === undefined){
const err60 = {instancePath:instancePath+"/chords/" + i3,schemaPath:"#/$defs/Chord/required",keyword:"required",params:{missingProperty: "quality"},message:"must have required property '"+"quality"+"'"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
if(data20.label === undefined){
const err61 = {instancePath:instancePath+"/chords/" + i3,schemaPath:"#/$defs/Chord/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
for(const key4 in data20){
if(!((((((key4 === "start") || (key4 === "end")) || (key4 === "root")) || (key4 === "quality")) || (key4 === "bass")) || (key4 === "label"))){
const err62 = {instancePath:instancePath+"/chords/" + i3,schemaPath:"#/$defs/Chord/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
if(data20.start !== undefined){
let data21 = data20.start;
if((typeof data21 == "number") && (isFinite(data21))){
if(data21 < 0 || isNaN(data21)){
const err63 = {instancePath:instancePath+"/chords/" + i3+"/start",schemaPath:"#/$defs/Chord/properties/start/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
else {
const err64 = {instancePath:instancePath+"/chords/" + i3+"/start",schemaPath:"#/$defs/Chord/properties/start/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
if(data20.end !== undefined){
let data22 = data20.end;
if((typeof data22 == "number") && (isFinite(data22))){
if(data22 < 0 || isNaN(data22)){
const err65 = {instancePath:instancePath+"/chords/" + i3+"/end",schemaPath:"#/$defs/Chord/properties/end/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
else {
const err66 = {instancePath:instancePath+"/chords/" + i3+"/end",schemaPath:"#/$defs/Chord/properties/end/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
if(data20.root !== undefined){
let data23 = data20.root;
if(!(((typeof data23 == "number") && (!(data23 % 1) && !isNaN(data23))) && (isFinite(data23)))){
const err67 = {instancePath:instancePath+"/chords/" + i3+"/root",schemaPath:"#/$defs/Chord/properties/root/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
if((typeof data23 == "number") && (isFinite(data23))){
if(data23 > 11 || isNaN(data23)){
const err68 = {instancePath:instancePath+"/chords/" + i3+"/root",schemaPath:"#/$defs/Chord/properties/root/maximum",keyword:"maximum",params:{comparison: "<=", limit: 11},message:"must be <= 11"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
if(data23 < 0 || isNaN(data23)){
const err69 = {instancePath:instancePath+"/chords/" + i3+"/root",schemaPath:"#/$defs/Chord/properties/root/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
}
if(data20.quality !== undefined){
let data24 = data20.quality;
if(typeof data24 !== "string"){
const err70 = {instancePath:instancePath+"/chords/" + i3+"/quality",schemaPath:"#/$defs/Chord/properties/quality/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if(!(((((((((((((((((((data24 === "maj") || (data24 === "min")) || (data24 === "dim")) || (data24 === "aug")) || (data24 === "sus2")) || (data24 === "sus4")) || (data24 === "5")) || (data24 === "maj6")) || (data24 === "min6")) || (data24 === "7")) || (data24 === "maj7")) || (data24 === "min7")) || (data24 === "minmaj7")) || (data24 === "dim7")) || (data24 === "hdim7")) || (data24 === "9")) || (data24 === "maj9")) || (data24 === "min9")) || (data24 === "add9"))){
const err71 = {instancePath:instancePath+"/chords/" + i3+"/quality",schemaPath:"#/$defs/Chord/properties/quality/enum",keyword:"enum",params:{allowedValues: schema35.properties.quality.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
}
if(data20.bass !== undefined){
let data25 = data20.bass;
if(!(((typeof data25 == "number") && (!(data25 % 1) && !isNaN(data25))) && (isFinite(data25)))){
const err72 = {instancePath:instancePath+"/chords/" + i3+"/bass",schemaPath:"#/$defs/Chord/properties/bass/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
if((typeof data25 == "number") && (isFinite(data25))){
if(data25 > 11 || isNaN(data25)){
const err73 = {instancePath:instancePath+"/chords/" + i3+"/bass",schemaPath:"#/$defs/Chord/properties/bass/maximum",keyword:"maximum",params:{comparison: "<=", limit: 11},message:"must be <= 11"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
if(data25 < 0 || isNaN(data25)){
const err74 = {instancePath:instancePath+"/chords/" + i3+"/bass",schemaPath:"#/$defs/Chord/properties/bass/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
}
if(data20.label !== undefined){
let data26 = data20.label;
if(typeof data26 === "string"){
if(func2(data26) < 1){
const err75 = {instancePath:instancePath+"/chords/" + i3+"/label",schemaPath:"#/$defs/Chord/properties/label/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
}
else {
const err76 = {instancePath:instancePath+"/chords/" + i3+"/label",schemaPath:"#/$defs/Chord/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
}
else {
const err77 = {instancePath:instancePath+"/chords/" + i3,schemaPath:"#/$defs/Chord/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
else {
const err78 = {instancePath:instancePath+"/chords",schemaPath:"#/properties/chords/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
if(data.notes !== undefined){
let data27 = data.notes;
if(Array.isArray(data27)){
const len3 = data27.length;
for(let i4=0; i4<len3; i4++){
let data28 = data27[i4];
if(data28 && typeof data28 == "object" && !Array.isArray(data28)){
if(data28.start === undefined){
const err79 = {instancePath:instancePath+"/notes/" + i4,schemaPath:"#/$defs/Note/required",keyword:"required",params:{missingProperty: "start"},message:"must have required property '"+"start"+"'"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
if(data28.end === undefined){
const err80 = {instancePath:instancePath+"/notes/" + i4,schemaPath:"#/$defs/Note/required",keyword:"required",params:{missingProperty: "end"},message:"must have required property '"+"end"+"'"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
if(data28.midi === undefined){
const err81 = {instancePath:instancePath+"/notes/" + i4,schemaPath:"#/$defs/Note/required",keyword:"required",params:{missingProperty: "midi"},message:"must have required property '"+"midi"+"'"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
if(data28.velocity === undefined){
const err82 = {instancePath:instancePath+"/notes/" + i4,schemaPath:"#/$defs/Note/required",keyword:"required",params:{missingProperty: "velocity"},message:"must have required property '"+"velocity"+"'"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
if(data28.hand === undefined){
const err83 = {instancePath:instancePath+"/notes/" + i4,schemaPath:"#/$defs/Note/required",keyword:"required",params:{missingProperty: "hand"},message:"must have required property '"+"hand"+"'"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
if(data28.source === undefined){
const err84 = {instancePath:instancePath+"/notes/" + i4,schemaPath:"#/$defs/Note/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
for(const key5 in data28){
if(!((((((key5 === "start") || (key5 === "end")) || (key5 === "midi")) || (key5 === "velocity")) || (key5 === "hand")) || (key5 === "source"))){
const err85 = {instancePath:instancePath+"/notes/" + i4,schemaPath:"#/$defs/Note/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
}
if(data28.start !== undefined){
let data29 = data28.start;
if((typeof data29 == "number") && (isFinite(data29))){
if(data29 < 0 || isNaN(data29)){
const err86 = {instancePath:instancePath+"/notes/" + i4+"/start",schemaPath:"#/$defs/Note/properties/start/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
else {
const err87 = {instancePath:instancePath+"/notes/" + i4+"/start",schemaPath:"#/$defs/Note/properties/start/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
if(data28.end !== undefined){
let data30 = data28.end;
if((typeof data30 == "number") && (isFinite(data30))){
if(data30 < 0 || isNaN(data30)){
const err88 = {instancePath:instancePath+"/notes/" + i4+"/end",schemaPath:"#/$defs/Note/properties/end/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
}
else {
const err89 = {instancePath:instancePath+"/notes/" + i4+"/end",schemaPath:"#/$defs/Note/properties/end/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
if(data28.midi !== undefined){
let data31 = data28.midi;
if(!(((typeof data31 == "number") && (!(data31 % 1) && !isNaN(data31))) && (isFinite(data31)))){
const err90 = {instancePath:instancePath+"/notes/" + i4+"/midi",schemaPath:"#/$defs/Note/properties/midi/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
if((typeof data31 == "number") && (isFinite(data31))){
if(data31 > 127 || isNaN(data31)){
const err91 = {instancePath:instancePath+"/notes/" + i4+"/midi",schemaPath:"#/$defs/Note/properties/midi/maximum",keyword:"maximum",params:{comparison: "<=", limit: 127},message:"must be <= 127"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
if(data31 < 0 || isNaN(data31)){
const err92 = {instancePath:instancePath+"/notes/" + i4+"/midi",schemaPath:"#/$defs/Note/properties/midi/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
}
}
if(data28.velocity !== undefined){
let data32 = data28.velocity;
if(!(((typeof data32 == "number") && (!(data32 % 1) && !isNaN(data32))) && (isFinite(data32)))){
const err93 = {instancePath:instancePath+"/notes/" + i4+"/velocity",schemaPath:"#/$defs/Note/properties/velocity/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
if((typeof data32 == "number") && (isFinite(data32))){
if(data32 > 127 || isNaN(data32)){
const err94 = {instancePath:instancePath+"/notes/" + i4+"/velocity",schemaPath:"#/$defs/Note/properties/velocity/maximum",keyword:"maximum",params:{comparison: "<=", limit: 127},message:"must be <= 127"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
if(data32 < 0 || isNaN(data32)){
const err95 = {instancePath:instancePath+"/notes/" + i4+"/velocity",schemaPath:"#/$defs/Note/properties/velocity/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
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
if(data28.hand !== undefined){
let data33 = data28.hand;
if(typeof data33 !== "string"){
const err96 = {instancePath:instancePath+"/notes/" + i4+"/hand",schemaPath:"#/$defs/Note/properties/hand/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
if(!((data33 === "left") || (data33 === "right"))){
const err97 = {instancePath:instancePath+"/notes/" + i4+"/hand",schemaPath:"#/$defs/Note/properties/hand/enum",keyword:"enum",params:{allowedValues: schema36.properties.hand.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
}
if(data28.source !== undefined){
let data34 = data28.source;
if(typeof data34 !== "string"){
const err98 = {instancePath:instancePath+"/notes/" + i4+"/source",schemaPath:"#/$defs/Note/properties/source/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
if(!((data34 === "transcribed") || (data34 === "arranged"))){
const err99 = {instancePath:instancePath+"/notes/" + i4+"/source",schemaPath:"#/$defs/Note/properties/source/enum",keyword:"enum",params:{allowedValues: schema36.properties.source.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
}
}
else {
const err100 = {instancePath:instancePath+"/notes/" + i4,schemaPath:"#/$defs/Note/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
}
}
else {
const err101 = {instancePath:instancePath+"/notes",schemaPath:"#/properties/notes/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
}
if(data.sections !== undefined){
let data35 = data.sections;
if(Array.isArray(data35)){
const len4 = data35.length;
for(let i5=0; i5<len4; i5++){
let data36 = data35[i5];
if(data36 && typeof data36 == "object" && !Array.isArray(data36)){
if(data36.start === undefined){
const err102 = {instancePath:instancePath+"/sections/" + i5,schemaPath:"#/$defs/Section/required",keyword:"required",params:{missingProperty: "start"},message:"must have required property '"+"start"+"'"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
if(data36.end === undefined){
const err103 = {instancePath:instancePath+"/sections/" + i5,schemaPath:"#/$defs/Section/required",keyword:"required",params:{missingProperty: "end"},message:"must have required property '"+"end"+"'"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
if(data36.label === undefined){
const err104 = {instancePath:instancePath+"/sections/" + i5,schemaPath:"#/$defs/Section/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
for(const key6 in data36){
if(!(((key6 === "start") || (key6 === "end")) || (key6 === "label"))){
const err105 = {instancePath:instancePath+"/sections/" + i5,schemaPath:"#/$defs/Section/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
}
if(data36.start !== undefined){
let data37 = data36.start;
if((typeof data37 == "number") && (isFinite(data37))){
if(data37 < 0 || isNaN(data37)){
const err106 = {instancePath:instancePath+"/sections/" + i5+"/start",schemaPath:"#/$defs/Section/properties/start/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
}
else {
const err107 = {instancePath:instancePath+"/sections/" + i5+"/start",schemaPath:"#/$defs/Section/properties/start/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
}
if(data36.end !== undefined){
let data38 = data36.end;
if((typeof data38 == "number") && (isFinite(data38))){
if(data38 < 0 || isNaN(data38)){
const err108 = {instancePath:instancePath+"/sections/" + i5+"/end",schemaPath:"#/$defs/Section/properties/end/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
}
else {
const err109 = {instancePath:instancePath+"/sections/" + i5+"/end",schemaPath:"#/$defs/Section/properties/end/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
}
if(data36.label !== undefined){
let data39 = data36.label;
if(typeof data39 === "string"){
if(func2(data39) < 1){
const err110 = {instancePath:instancePath+"/sections/" + i5+"/label",schemaPath:"#/$defs/Section/properties/label/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
}
else {
const err111 = {instancePath:instancePath+"/sections/" + i5+"/label",schemaPath:"#/$defs/Section/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
}
}
else {
const err112 = {instancePath:instancePath+"/sections/" + i5,schemaPath:"#/$defs/Section/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
}
}
else {
const err113 = {instancePath:instancePath+"/sections",schemaPath:"#/properties/sections/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
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
const err114 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
validate20.errors = vErrors;
return errors === 0;
}
validate20.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

