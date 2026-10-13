const { CandidateModel, CandidateSchema } = require('./Candidate');
const { ConfigModel, ConfigSchema, TimetableSubSchema, ClassTestSubSchema, AnnouncementSubSchema } = require('./Config');
const { VideoLectureModel, VideoLectureSchema } = require('./VideoLecture');
const { CourseMaterialModel, CourseMaterialSchema } = require('./CourseMaterial');
const { TestConfigModel, TestConfigSchema, QuestionSchema } = require('./TestConfig');
const { TestSubmissionModel, TestSubmissionSchema, AnswerSchema } = require('./TestSubmission');
const { EIRFReportModel, EIRFReportSchema } = require('./EIRFReport');
const { RecycleBinModel, RecycleBinSchema } = require('./RecycleBin');
const { SystemLogModel, SystemLogSchema } = require('./SystemLog');
const { TicketModel, TicketSchema } = require('./Ticket');
const { TestSignalModel, TestSignalSchema } = require('./TestSignal');
const { TestTokenModel, TestTokenSchema } = require('./TestToken');
const { ClassroomSubmissionModel, ClassroomSubmissionSchema } = require('./ClassroomSubmission');
const { CounterfoilSubmissionModel, CounterfoilSubmissionSchema } = require('./CounterfoilSubmission');
const { AcademicMarksLedgerModel, AcademicMarksLedgerSchema } = require('./AcademicMarksLedger');
const { LectureChatModel, LectureChatSchema } = require('./LectureChat');
const { WorkerLogModel, WorkerLogSchema } = require('./WorkerLog');

module.exports = {
    CandidateModel,
    CandidateSchema,
    ConfigModel,
    ConfigSchema,
    TimetableSubSchema,
    ClassTestSubSchema,
    AnnouncementSubSchema,
    VideoLectureModel,
    VideoLectureSchema,
    CourseMaterialModel,
    CourseMaterialSchema,
    TestConfigModel,
    TestConfigSchema,
    QuestionSchema,
    TestSubmissionModel,
    TestSubmissionSchema,
    AnswerSchema,
    EIRFReportModel,
    EIRFReportSchema,
    RecycleBinModel,
    RecycleBinSchema,
    SystemLogModel,
    SystemLogSchema,
    TicketModel,
    TicketSchema,
    TestSignalModel,
    TestSignalSchema,
    TestTokenModel,
    TestTokenSchema,
    ClassroomSubmissionModel,
    ClassroomSubmissionSchema,
    CounterfoilSubmissionModel,
    CounterfoilSubmissionSchema,
    AcademicMarksLedgerModel,
    AcademicMarksLedgerSchema,
    LectureChatModel,
    LectureChatSchema,
    WorkerLogModel,
    WorkerLogSchema
};
