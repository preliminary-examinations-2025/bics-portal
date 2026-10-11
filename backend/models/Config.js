const mongoose = require('mongoose');

const TimetableSubSchema = new mongoose.Schema({
    code: String,
    course: String,
    date: String,
    time: String,
    marks: Number
}, { _id: false, id: false });

const ClassTestSubSchema = new mongoose.Schema({
    id: String,
    courseName: String,
    date: String,
    time: String,
    topic: String,
    marks: Number
}, { _id: false, id: false });

const AnnouncementSubSchema = new mongoose.Schema({
    id: Number,
    date: String,
    text: String
}, { _id: false, id: false });

const ConfigSchema = new mongoose.Schema({
    courseRegistrationActive: { type: Boolean, default: true },
    onlineExamActive: { type: Boolean, default: true },
    midSemFeedbackActive: { type: Boolean, default: false },
    endSemFeedbackActive: { type: Boolean, default: false },
    exitFormActive: { type: Boolean, default: false },
    hallTicketDownloadActive: { type: Boolean, default: true },
    counterfoilActive: { type: Boolean, default: true },
    hallTicketUrl: { type: String, default: '/public/textbooks/CS_Introduction_Textbook.pdf' },
    timetableNotice: { type: String, default: 'Mid semester test for BICS 2026 will be held in mid-August' },
    examType: { type: String, default: 'midsem' }, // 'midsem' or 'endsem'
    timetable: [TimetableSubSchema],
    classTests: [ClassTestSubSchema],
    announcements: [AnnouncementSubSchema]
});

const ConfigModel = mongoose.model('Config', ConfigSchema);

module.exports = {
    TimetableSubSchema,
    ClassTestSubSchema,
    AnnouncementSubSchema,
    ConfigSchema,
    ConfigModel
};
